/**
 * AXIOM One PWA — mock feed server (DESIGN-ONLY / loopback stub).
 *
 * Serves synthetic fixture data so PWA UI work can proceed without the real
 * backend. Binds 127.0.0.1 only. Every response carries `mock: true`.
 *
 * NOT wired to the real relay. Real wiring follows F-1..F-3 (presence-post
 * registry adoption); scope labels here are mock annotations, not claims.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FEED_CONTRACT_ROOT = dirname(fileURLToPath(import.meta.url));
const LOOPBACK_HOST = '127.0.0.1';
const AUDIENCE_PATTERN = /^(public|intimate|named:[A-Za-z0-9._-]+|circle:[A-Za-z0-9._-]+)$/;

function encodeCursor(seqExclusiveBound) {
  return Buffer.from(JSON.stringify({ max_seq: seqExclusiveBound }), 'utf8').toString('base64url');
}

function decodeCursor(value) {
  const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  if (!parsed || !Number.isInteger(parsed.max_seq)) throw new Error('bad cursor');
  return parsed.max_seq;
}

export async function startMockFeedServer({ host = LOOPBACK_HOST, port = 0 } = {}) {
  if (host !== LOOPBACK_HOST) throw new Error('Mock feed server must bind IPv4 loopback');
  const fixtures = JSON.parse(await readFile(join(FEED_CONTRACT_ROOT, 'fixtures.json'), 'utf8'));
  const items = fixtures.items.map(item => ({ ...item, projections: item.projections.map(p => ({ ...p })) }));
  const ledger = fixtures.ledger.map(record => ({ ...record }));
  const drafts = fixtures.drafts.map(draft => ({ ...draft }));
  let rescindBumps = 0;
  const mockCounters = { attestations: 0 };

  const serverSeq = () => Math.max(...items.map(item => item.seq)) + rescindBumps;

  function visibleProjections(audience) {
    return items
      .filter(item => item.audience === audience && !item.rescinded)
      .sort((a, b) => b.seq - a.seq)
      .map(item => ({ ...item.projections[0], item_id: item.item_id, kind: item.kind, sent_at: item.sent_at, author: item.author, audience: item.audience }));
  }

  function audienceEntitlement(audience) {
    // Mock plays the operator node: the operator is entitled to every audience
    // that exists in the fixture set. Unknown circle/named scopes fail closed.
    if (audience === 'public' || audience === 'intimate') return { ok: true };
    if (items.some(item => item.audience === audience)) return { ok: true };
    return { ok: false, code: 'not_authorized_for_audience', status: 403, message: `Mock has no audience '${audience}' on the operator roster` };
  }

  function sendJson(res, status, value) {
    const body = Buffer.from(JSON.stringify(value));
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(body.length),
      'cache-control': 'no-store'
    });
    res.end(body);
  }

  function sendError(res, status, code, message, traceId) {
    sendJson(res, status, { error: { code, message }, trace_id: traceId, mock: true });
  }

  const server = createServer((req, res) => {
    (async () => {
      const traceId = `mock_${crypto.randomUUID()}`;
      let url;
      try {
        url = new URL(req.url, 'http://127.0.0.1');
      } catch {
        sendError(res, 400, 'validation_error', 'Invalid request target', traceId);
        return;
      }
      const { pathname } = url;

      if (pathname === '/mock-info') {
        if (req.method !== 'GET') { sendError(res, 405, 'validation_error', 'Method not allowed', traceId); return; }
        sendJson(res, 200, {
          mock: true,
          name: 'axiom-one-feed-mock',
          contract: 'feed-contract.v1',
          note: 'Scaffolding only. NOT wired to the real relay. Real wiring follows F-1..F-3 (presence-post registry adoption). Fixture data is synthetic.',
          f_dependency: 'F-1 -> F-2 -> F-3; this mock makes no registry claims'
        });
        return;
      }

      const rescindMatch = pathname.match(/^\/v1\/feed\/([A-Za-z0-9_.-]+)\/rescind$/);
      if (rescindMatch && req.method === 'POST') {
        const item = items.find(candidate => candidate.item_id === rescindMatch[1]);
        if (!item) { sendError(res, 404, 'not_found', 'No such item', traceId); return; }
        if (!item.rescinded) {
          rescindBumps += 1;
          mockCounters.attestations += 1;
          item.rescinded = true;
          item.rescind_receipt = {
            rescind_id: `rs_demo_${item.item_id.slice('fi_demo_'.length)}`,
            tombstone_id: `ts_demo_${item.item_id.slice('fi_demo_'.length)}`,
            rescinded_at: new Date().toISOString(),
            attestations: [{
              attestation_id: `ra_demo_${item.item_id.slice('fi_demo_'.length)}_live`,
              sent_to: 'mock mirror registry (loopback only)',
              at: new Date().toISOString()
            }],
            local_effects: [{ surface: 'mock feed', action: 'projection dropped', at: new Date().toISOString() }],
            ui_copy: 'removed everywhere you control; 1 mirrors asked, 1 honored.',
            mock_only: true
          };
          ledger.push({
            rescind_id: item.rescind_receipt.rescind_id,
            item_id: item.item_id,
            scope_before: item.audience,
            scope_after: 'tombstoned',
            reason: 'mock rescind via POST',
            tombstone_id: item.rescind_receipt.tombstone_id,
            attestations: item.rescind_receipt.attestations,
            local_effects: item.rescind_receipt.local_effects,
            at: item.rescind_receipt.rescinded_at
          });
        }
        sendJson(res, 200, item.rescind_receipt);
        return;
      }

      if (pathname === '/v1/feed/drafts' && req.method === 'GET') {
        sendJson(res, 200, { drafts });
        return;
      }

      if (pathname === '/v1/feed/ledger' && req.method === 'GET') {
        sendJson(res, 200, { records: ledger });
        return;
      }

      if (pathname === '/v1/feed' && req.method === 'GET') {
        const audience = url.searchParams.get('audience');
        if (!audience || !AUDIENCE_PATTERN.test(audience)) {
          sendError(res, 400, 'validation_error', 'Malformed audience descriptor — the whole request fails, no partial results', traceId);
          return;
        }
        const entitlement = audienceEntitlement(audience);
        if (!entitlement.ok) {
          sendError(res, entitlement.status, entitlement.code, entitlement.message, traceId);
          return;
        }
        let limit = 20;
        const limitRaw = url.searchParams.get('limit');
        if (limitRaw !== null) {
          limit = Number(limitRaw);
          if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            sendError(res, 400, 'validation_error', 'limit must be an integer 1..100', traceId);
            return;
          }
        }
        const lens = url.searchParams.get('lens') ?? 'none';
        if (!/^[A-Za-z0-9_.-]{1,120}$/.test(lens)) {
          sendError(res, 400, 'validation_error', 'Malformed lens id', traceId);
          return;
        }
        let bound = Number.MAX_SAFE_INTEGER;
        const cursorRaw = url.searchParams.get('cursor');
        if (cursorRaw !== null && cursorRaw !== '') {
          try {
            bound = decodeCursor(cursorRaw);
          } catch {
            sendError(res, 400, 'validation_error', 'Malformed cursor', traceId);
            return;
          }
        }
        // Mock lens semantics: a lens may only reorder/emphasize over the SAME
        // item set — it can never change which items are eligible.
        const eligible = visibleProjections(audience).filter(projection => projectionItemSeq(items, projection) < bound);
        const page = eligible.slice(0, limit);
        sendJson(res, 200, {
          items: page,
          next_cursor: eligible.length > limit ? encodeCursor(projectionItemSeq(items, page[page.length - 1])) : null,
          server_seq: serverSeq()
        });
        return;
      }

      const itemMatch = pathname.match(/^\/v1\/feed\/([A-Za-z0-9_.-]+)$/);
      if (itemMatch && req.method === 'GET') {
        const audience = url.searchParams.get('audience');
        if (!audience || !AUDIENCE_PATTERN.test(audience)) {
          sendError(res, 400, 'validation_error', 'Malformed audience descriptor', traceId);
          return;
        }
        const entitlement = audienceEntitlement(audience);
        if (!entitlement.ok) {
          sendError(res, entitlement.status, entitlement.code, entitlement.message, traceId);
          return;
        }
        const item = items.find(candidate => candidate.item_id === itemMatch[1]);
        // Coarse 404 by design: nonexistent, rescinded, and
        // not-in-your-audience are indistinguishable (no probing oracle).
        if (!item || item.rescinded || item.audience !== audience) {
          sendError(res, 404, 'not_found', 'No such projection', traceId);
          return;
        }
        sendJson(res, 200, { ...item.projections[0], item_id: item.item_id, kind: item.kind, sent_at: item.sent_at, author: item.author, audience: item.audience });
        return;
      }

      sendError(res, 404, 'not_found', 'Mock route not found', traceId);
    })().catch(() => {
      if (!res.headersSent) sendError(res, 500, 'mock_limitation', 'Mock request failed', `mock_${crypto.randomUUID()}`);
      else if (!res.writableEnded) res.end();
    });
  });

  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolveListen);
  });
  const actualPort = server.address().port;
  return {
    name: 'axiom-one-feed-mock',
    host,
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    mock: true,
    stop: () => new Promise((resolveStop, reject) => {
      server.close(error => (error ? reject(error) : resolveStop()));
    })
  };
}

function projectionItemSeq(items, projection) {
  const item = items.find(candidate => candidate.item_id === projection.item_id);
  return item ? item.seq : -1;
}

async function main() {
  const mock = await startMockFeedServer({
    port: Number(process.env.FEED_MOCK_PORT ?? 0)
  });
  process.stdout.write(`${JSON.stringify({ message: 'AXIOM One feed mock ready', url: mock.url, mock: true })}\n`);
  const stop = async () => {
    await mock.stop();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
