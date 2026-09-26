import { createPrivateKey, createPublicKey } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ValidationError } from './canonical.mjs';
import { ReplayGuard } from './identity.mjs';
import { DataProtector } from './protector.mjs';
import { CircleReplica, circleRecordTime, circleUpdateDigest, createCircleUpdate } from './circle-exchange.mjs';
import {
  circleDisclosureKeyRecord,
  openCircleSealedContent,
  sealCircleContent
} from './circle-disclosure.mjs';
import { circleKeyId } from './circle-keys.mjs';
import { detectCircleWithholding, detectCircleWithholdingAcross } from './circle-withholding.mjs';
import {
  circlePeerOrigin,
  createCircleSyncServer,
  httpCircleSender,
  syncCirclePeer
} from './circle-transport.mjs';

/**
 * A member's Circle node: one Circle replica held in encrypted local state,
 * served to other members over HTTPS and synced with configured peers
 * (circle-transport.mjs). Laboratory, off by default: nothing starts it, and
 * a configuration must say `enabled: true`.
 *
 * One process owns the state at a time (a lock beside the state file), so a
 * serving node and a one-shot sync cannot overwrite each other's updates.
 *
 * A member publishes through their own node: appendCirclePeerRecord signs a
 * record as the next update in the member's own key log, and the next sync
 * or serve carries it to peers. With a disclosure key, the node publishes
 * that key, seals content for an audience, and opens content sealed for the
 * member (circle-disclosure.mjs).
 */

export const CIRCLE_PEER_CONFIG_SCHEMA = 'axiom-circle-peer-config.v0';
export const CIRCLE_PEER_STATE_SCHEMA = 'axiom-circle-peer-state.v0';
const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_STATE_BYTES = 64 * 1024 * 1024;
const MAX_PEERS = 16;
const REPLAY_CAPACITY = 10_000;
const pendingSaves = new WeakMap();
// The latest verified node evidence (statement and the heads it signed)
// from each peer, and the withholding findings drawn from it, kept with the
// replica (circle-transport.mjs, circle-withholding.mjs).
const peerEvidence = new WeakMap();
const peerFindings = new WeakMap();
const MAX_FINDINGS = 256;
// Findings drawn from statements published as node evidence.
const PUBLISHED_EVIDENCE_ORIGIN = 'published-evidence';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const HOSTNAME = /^[A-Za-z0-9.:-]{1,253}$/;

export async function loadCirclePeerRuntime(configPath, { allowInsecureLoopback = false } = {}) {
  const path = absolutePath(configPath, 'Circle peer config path');
  let parsed;
  try {
    parsed = JSON.parse(await privateFile(path, MAX_CONFIG_BYTES, 'Circle peer config'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ValidationError('Circle peer config must contain valid JSON');
    throw error;
  }
  const config = normalizeConfig(parsed, { allowInsecureLoopback });
  let genesis;
  try {
    genesis = JSON.parse(await regularFile(config.genesis_file, MAX_CONFIG_BYTES, 'Circle genesis'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ValidationError('Circle genesis must contain valid JSON');
    throw error;
  }
  const genesisDigest = new CircleReplica({ genesis }).genesisDigest;
  let privateKey;
  try {
    privateKey = createPrivateKey(await privateFile(config.member.private_key_file, 8_192, 'Circle member key'));
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('Circle member key is invalid');
  }
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new ValidationError('Circle member key must use Ed25519');
  let disclosureKey = null;
  if (config.member.disclosure_key_file) {
    try {
      disclosureKey = createPrivateKey(await privateFile(config.member.disclosure_key_file, 8_192, 'Circle disclosure key'));
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError('Circle disclosure key is invalid');
    }
    if (disclosureKey.asymmetricKeyType !== 'x25519') throw new ValidationError('Circle disclosure key must use X25519');
  }
  const stateKey = Buffer.from((await privateFile(config.state_key_file, 4_096, 'Circle peer state key')).trim(), 'base64url');
  if (stateKey.length !== 32) throw new ValidationError('Circle peer state key must contain 32 bytes');
  const tls = config.listen?.tls_key_file
    ? {
      key: await privateFile(config.listen.tls_key_file, 16_384, 'Circle peer TLS key'),
      cert: await regularFile(config.listen.tls_cert_file, 65_536, 'Circle peer TLS certificate')
    }
    : null;
  const peers = [];
  for (const peer of config.peers) {
    peers.push(Object.freeze({
      origin: peer.origin,
      servername: peer.server_name,
      ca: peer.ca_file ? await regularFile(peer.ca_file, 65_536, 'Circle peer CA') : undefined
    }));
  }
  return Object.freeze({
    config_path: path,
    config,
    genesis,
    genesis_digest: genesisDigest,
    principal_id: config.member.principal_id,
    key_id: circleKeyId(privateKey),
    private_key: privateKey,
    disclosure_key: disclosureKey,
    protector: new DataProtector(stateKey),
    tls,
    peers: Object.freeze(peers),
    allow_insecure_loopback: allowInsecureLoopback
  });
}

/** The replica from encrypted state, or a new one holding only the genesis. */
export async function openCirclePeerReplica(runtime) {
  const replica = new CircleReplica({ genesis: runtime.genesis });
  let serialized;
  try {
    const metadata = await stat(runtime.config.state_file);
    if (!metadata.isFile() || metadata.size > MAX_STATE_BYTES) {
      throw new ValidationError('Circle peer state must be a bounded regular file');
    }
    serialized = await readFile(runtime.config.state_file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return replica;
    throw error;
  }
  const state = runtime.protector.open(serialized.trim(), stateContext(runtime.genesis_digest));
  if (
    state?.schema !== CIRCLE_PEER_STATE_SCHEMA
    || state.genesis_digest !== runtime.genesis_digest
    || !Array.isArray(state.updates)
  ) throw new ValidationError('Circle peer state is invalid');
  // Every stored update is checked again as if it had just arrived.
  if (state.evidence !== undefined) {
    if (!Array.isArray(state.evidence) || state.evidence.length > MAX_PEERS * 4) {
      throw new ValidationError('Circle peer state evidence is invalid');
    }
    peerEvidence.set(replica, new Map(state.evidence.map(item => [item.origin, { statement: item.statement, heads: item.heads }])));
  }
  if (state.findings !== undefined) {
    if (!Array.isArray(state.findings) || state.findings.length > MAX_FINDINGS) {
      throw new ValidationError('Circle peer state findings are invalid');
    }
    peerFindings.set(replica, [...state.findings]);
  }
  for (const update of state.updates) {
    const result = replica.receive(update);
    if (result.status === 'rejected') throw new ValidationError(`Circle peer state holds an invalid update: ${result.code}`);
  }
  return replica;
}

export function saveCirclePeerReplica(runtime, replica) {
  // Incoming offers and outbound syncs can save the same live replica at
  // once. Serialize the snapshots as well as the renames, so an older save
  // cannot replace a newer state file after the newer save has completed.
  const save = (pendingSaves.get(runtime) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const sealed = runtime.protector.seal({
      schema: CIRCLE_PEER_STATE_SCHEMA,
      genesis_digest: runtime.genesis_digest,
      updates: replica.exportUpdates(),
      evidence: [...(peerEvidence.get(replica) ?? new Map())]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([origin, evidence]) => ({ origin, statement: evidence.statement, heads: evidence.heads })),
      findings: peerFindings.get(replica) ?? []
    }, stateContext(runtime.genesis_digest));
    await atomicReplace(runtime.config.state_file, `${sealed}\n`, 0o600);
  });
  pendingSaves.set(runtime, save);
  return save;
}

/**
 * Syncs with every configured peer in turn, saving after each. A peer that
 * fails is reported and the others still run.
 */
export async function syncCirclePeers(runtime, replica, {
  senderFor = peer => httpCircleSender({ ...peer, allowInsecureLoopback: runtime.allow_insecure_loopback }),
  now = () => Date.now()
} = {}) {
  const results = [];
  const received = [];
  for (const peer of runtime.peers) {
    try {
      const result = await syncCirclePeer({
        replica,
        principalId: runtime.principal_id,
        privateKey: runtime.private_key,
        send: senderFor(peer),
        now
      });
      const found = [];
      const kept = peerEvidence.get(replica) ?? new Map();
      // What this node's signatures contradict, statement by statement:
      // against its previous evidence and the updates held from its own logs.
      for (const current of result.evidence) {
        received.push(current);
        found.push(...recordFindings(replica, peer.origin, detectCircleWithholding({
          replica, previous: kept.get(peer.origin) ?? null, current
        })));
        kept.delete(peer.origin);
        kept.set(peer.origin, current);
      }
      // Bounded: origins dropped from the configuration age out.
      while (kept.size > MAX_PEERS * 4) kept.delete(kept.keys().next().value);
      peerEvidence.set(replica, kept);
      const { evidence: _evidence, ...summary } = result;
      results.push({ origin: peer.origin, status: 'synced', ...summary, findings: found.length });
    } catch (error) {
      if (!(error instanceof ValidationError) && !isNetworkError(error)) throw error;
      results.push({ origin: peer.origin, status: 'failed', code: error.code ?? 'error', message: error.message });
    } finally {
      // A pull may have accepted updates before a later round failed. Keep
      // that progress durable even when this peer is reported as failed.
      await saveCirclePeerReplica(runtime, replica);
    }
  }
  // Statements from one node to different members, compared together: node
  // evidence members published, and this member's own (every statement from
  // this sync, and the latest kept from earlier ones).
  recordFindings(replica, PUBLISHED_EVIDENCE_ORIGIN, detectCircleWithholdingAcross({
    replica,
    evidence: [
      ...replica.view({ asOf: new Date(now()).toISOString() }).node_evidence.map(item => item.evidence),
      ...(peerEvidence.get(replica) ?? new Map()).values(),
      ...received
    ]
  }));
  await saveCirclePeerReplica(runtime, replica);
  return results;
}

/** Runs one sync with every peer while holding the state lock. */
export async function runCirclePeerSync(runtime, options = {}) {
  const lock = await acquireStateLock(runtime.config.state_file);
  try {
    const replica = await openCirclePeerReplica(runtime);
    const peers = await syncCirclePeers(runtime, replica, options);
    return { genesis_digest: runtime.genesis_digest, peers, status: summarize(replica) };
  } finally {
    await lock.release();
  }
}

/**
 * Serves the Circle to other members and syncs with the configured peers
 * every `sync_interval_seconds`, holding the state lock until closed.
 */
export async function serveCirclePeer(runtime, { now = () => Date.now(), senderFor } = {}) {
  if (!runtime.config.listen) throw new ValidationError('Circle peer config has no listen section');
  const lock = await acquireStateLock(runtime.config.state_file);
  let server;
  let timer;
  try {
    const replica = await openCirclePeerReplica(runtime);
    server = createCircleSyncServer({
      // Answers are signed with this member's Circle key.
      signer: { principalId: runtime.principal_id, privateKey: runtime.private_key },
      replica,
      replayGuard: new ReplayGuard({ maxEntries: REPLAY_CAPACITY }),
      onChange: () => saveCirclePeerReplica(runtime, replica),
      tls: runtime.tls,
      allowInsecureLoopback: runtime.allow_insecure_loopback,
      now
    });
    await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(runtime.config.listen.port, runtime.config.listen.host, () => {
        server.off('error', rejectListen);
        resolveListen();
      });
    });
    let running = Promise.resolve();
    const syncOnce = () => {
      running = running.then(() => syncCirclePeers(runtime, replica, { now, ...(senderFor ? { senderFor } : {}) }));
      return running;
    };
    if (runtime.peers.length && runtime.config.sync_interval_seconds) {
      timer = setInterval(() => { syncOnce().catch(() => {}); }, runtime.config.sync_interval_seconds * 1000);
      timer.unref();
    }
    const address = server.address();
    return {
      replica,
      port: address.port,
      syncOnce,
      status: () => summarize(replica),
      close: async () => {
        clearInterval(timer);
        await new Promise(resolveClose => server.close(() => resolveClose()));
        await running.catch(() => {});
        await lock.release();
      }
    };
  } catch (error) {
    clearInterval(timer);
    server?.close();
    await lock.release();
    throw error;
  }
}

/**
 * Signs `record` as the next update in this member's own key log and adds
 * it to `replica`. Returns its digest and counter, and whether the view as
 * of the record's time keeps it (`excluded` names why not). The replica may
 * accept an update the view excludes, for example a record this member was
 * not entitled to make: it is signed history either way.
 */
export function appendCircleRecord(runtime, replica, { recordType, record }) {
  const own = replica.heads().heads.find(head => head.author === runtime.principal_id && head.key_id === runtime.key_id);
  const counter = (own?.counter ?? 0) + 1;
  const previous = own
    ? replica.authoredAfter({ author: runtime.principal_id, keyId: runtime.key_id, counter: own.counter - 1 })[0].update
    : null;
  const update = createCircleUpdate({
    genesis: runtime.genesis,
    author: runtime.principal_id,
    counter,
    previous,
    recordType,
    record,
    privateKey: runtime.private_key
  });
  const result = replica.receive(update);
  if (result.status !== 'accepted') {
    throw new ValidationError(`Circle record was not accepted: ${result.code ?? result.status}${result.reason ? ` (${result.reason})` : ''}`);
  }
  const digest = circleUpdateDigest(update);
  const at = circleRecordTime(recordType, record);
  const excluded = replica.view({ asOf: at }).excluded.find(item => item.digest === digest)?.reason ?? null;
  return { digest, counter, record_type: recordType, excluded };
}

/** appendCircleRecord under the state lock, saved before the lock is released. */
export async function appendCirclePeerRecord(runtime, input) {
  const lock = await acquireStateLock(runtime.config.state_file);
  try {
    const replica = await openCirclePeerReplica(runtime);
    const appended = appendCircleRecord(runtime, replica, input);
    await saveCirclePeerReplica(runtime, replica);
    return appended;
  } finally {
    await lock.release();
  }
}

/** Publishes this member's disclosure key (member.disclosure_key_file). */
export async function publishCirclePeerDisclosureKey(runtime, { now = () => Date.now() } = {}) {
  const key = requireDisclosureKey(runtime);
  const record = circleDisclosureKeyRecord({
    principalId: runtime.principal_id,
    publicKey: createPublicKey(key).export({ format: 'jwk' }).x,
    publishedAt: new Date(now()).toISOString()
  });
  return appendCirclePeerRecord(runtime, { recordType: 'disclosure_key', record });
}

/**
 * Publishes the latest statement this member holds from the peer at
 * `origin`, with the heads it signed, as node evidence. Other members then
 * compare it with what that node served them (circle-withholding.mjs).
 */
export async function publishCirclePeerNodeEvidence(runtime, origin, { now = () => Date.now() } = {}) {
  const lock = await acquireStateLock(runtime.config.state_file);
  try {
    const replica = await openCirclePeerReplica(runtime);
    const evidence = (peerEvidence.get(replica) ?? new Map()).get(origin);
    if (!evidence) throw new ValidationError(`No statement from ${origin} to publish; sync with it first`);
    const appended = appendCircleRecord(runtime, replica, {
      recordType: 'node_evidence',
      record: {
        published_by: runtime.principal_id,
        published_at: new Date(Math.max(now(), Date.parse(evidence.statement.body.issued_at))).toISOString(),
        evidence: { statement: evidence.statement, heads: evidence.heads }
      }
    });
    await saveCirclePeerReplica(runtime, replica);
    return appended;
  } finally {
    await lock.release();
  }
}

/**
 * Seals `value` for the members holding `roleIds` and publishes it. The
 * recipients are exactly those every replica will expect.
 */
export async function sealCirclePeerContent(runtime, { roleIds, value, now = () => Date.now() }) {
  requireDisclosureKey(runtime);
  const lock = await acquireStateLock(runtime.config.state_file);
  try {
    const replica = await openCirclePeerReplica(runtime);
    const at = new Date(now()).toISOString();
    const record = sealCircleContent({
      genesisDigest: runtime.genesis_digest,
      publishedBy: runtime.principal_id,
      publishedAt: at,
      audienceRoles: roleIds,
      recipients: replica.disclosureRecipients({ publisher: runtime.principal_id, roleIds: [...new Set(roleIds)].sort(), at }),
      value
    });
    const appended = appendCircleRecord(runtime, replica, { recordType: 'sealed_content', record });
    await saveCirclePeerReplica(runtime, replica);
    return { ...appended, recipients: record.envelope.recipients.map(item => item.principal_id) };
  } finally {
    await lock.release();
  }
}

/** Opens sealed content (by its update digest) addressed to this member. */
export async function openCirclePeerContent(runtime, digest) {
  const key = requireDisclosureKey(runtime);
  const replica = await openCirclePeerReplica(runtime);
  const update = replica.exportUpdates().find(item => circleUpdateDigest(item) === digest);
  if (!update || update.body.record_type !== 'sealed_content') {
    throw new ValidationError('No sealed content with that digest is held');
  }
  return openCircleSealedContent({
    record: update.body.record,
    genesisDigest: runtime.genesis_digest,
    principalId: runtime.principal_id,
    privateKey: key
  });
}

function requireDisclosureKey(runtime) {
  if (!runtime.disclosure_key) throw new ValidationError('Circle peer config has no member.disclosure_key_file');
  return runtime.disclosure_key;
}

export async function circlePeerStatus(runtime) {
  const replica = await openCirclePeerReplica(runtime);
  return {
    genesis_digest: runtime.genesis_digest,
    status: summarize(replica),
    statements: [...(peerEvidence.get(replica) ?? new Map())].map(([origin, { statement }]) => ({
      origin,
      principal_id: statement.body.principal_id,
      key_id: statement.body.key_id,
      operation: statement.body.operation,
      issued_at: statement.body.issued_at
    })),
    findings: (peerFindings.get(replica) ?? []).map(item => ({
      origin: item.origin,
      kind: item.finding.kind,
      author: item.finding.author,
      key_id: item.finding.key_id,
      ...(item.finding.kind === 'heads_regressed'
        ? { earlier_counter: item.finding.earlier_counter, later_counter: item.finding.later_counter }
        : { claimed_counter: item.finding.claimed_counter, withheld_counter: item.finding.withheld_counter })
    }))
  };
}

/** Every recorded finding, with its evidence, for independent verification. */
export async function circlePeerFindings(runtime) {
  const replica = await openCirclePeerReplica(runtime);
  return { replica, findings: [...(peerFindings.get(replica) ?? [])] };
}

// Appends new findings, once each, keeping the most recent MAX_FINDINGS.
function recordFindings(replica, origin, findings) {
  const list = peerFindings.get(replica) ?? [];
  const seen = new Set(list.map(item => findingKey(item.finding)));
  const added = [];
  for (const finding of findings) {
    const key = findingKey(finding);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({ origin, finding });
  }
  const next = [...list, ...added].slice(-MAX_FINDINGS);
  peerFindings.set(replica, next);
  return added;
}

// One finding per fact: the first evidence of it is enough, so the same
// withholding seen on every later sync is not recorded again. The fact
// names the node whose statements it is drawn from.
function findingKey(finding) {
  const node = finding.evidence?.at(-1)?.statement?.body?.principal_id ?? '';
  return finding.kind === 'heads_regressed'
    ? ['heads_regressed', node, finding.author, finding.key_id, finding.earlier_counter, finding.later_counter].join('\u0000')
    : ['own_update_withheld', node, finding.author, finding.key_id, finding.withheld_counter].join('\u0000');
}

function summarize(replica) {
  const heads = replica.heads();
  return {
    updates: replica.size,
    pending: replica.pendingUpdates(),
    key_logs: heads.heads.length,
    equivocations: heads.equivocations.length
  };
}

function normalizeConfig(value, { allowInsecureLoopback }) {
  if (!isPlainObject(value) || value.schema !== CIRCLE_PEER_CONFIG_SCHEMA) {
    throw new ValidationError(`Circle peer config must use ${CIRCLE_PEER_CONFIG_SCHEMA}`);
  }
  allowedKeys(value, ['schema', 'enabled', 'genesis_file', 'member', 'state_file', 'state_key_file', 'listen', 'peers', 'sync_interval_seconds'], 'Circle peer config');
  // Off by default: a configuration must opt in explicitly.
  if (value.enabled !== true) {
    throw new ValidationError('Circle peer transport is disabled; set "enabled": true to run it');
  }
  if (!isPlainObject(value.member)) throw new ValidationError('Circle peer member is invalid');
  allowedKeys(value.member, ['principal_id', 'private_key_file', 'disclosure_key_file'], 'Circle peer member');
  if (!IDENTIFIER.test(value.member.principal_id ?? '')) throw new ValidationError('Circle peer principal_id is invalid');
  let listen = null;
  if (value.listen !== undefined) {
    if (!isPlainObject(value.listen)) throw new ValidationError('Circle peer listen is invalid');
    allowedKeys(value.listen, ['host', 'port', 'tls_key_file', 'tls_cert_file'], 'Circle peer listen');
    if (!HOSTNAME.test(value.listen.host ?? '')) {
      throw new ValidationError('Circle peer listen host is invalid');
    }
    if (!Number.isSafeInteger(value.listen.port) || value.listen.port < 0 || value.listen.port > 65_535) {
      throw new ValidationError('Circle peer listen port is invalid');
    }
    const hasTls = value.listen.tls_key_file !== undefined || value.listen.tls_cert_file !== undefined;
    if (!hasTls && !allowInsecureLoopback) throw new ValidationError('Circle peer listen requires tls_key_file and tls_cert_file');
    listen = {
      host: value.listen.host,
      port: value.listen.port,
      ...(hasTls ? {
        tls_key_file: absolutePath(value.listen.tls_key_file, 'Circle peer tls_key_file'),
        tls_cert_file: absolutePath(value.listen.tls_cert_file, 'Circle peer tls_cert_file')
      } : {})
    };
  }
  if (!Array.isArray(value.peers) || value.peers.length > MAX_PEERS) {
    throw new ValidationError(`Circle peer peers must be a list of at most ${MAX_PEERS}`);
  }
  const peers = value.peers.map(peer => {
    if (!isPlainObject(peer)) throw new ValidationError('Circle peer entry is invalid');
    allowedKeys(peer, ['origin', 'ca_file', 'server_name'], 'Circle peer entry');
    circlePeerOrigin(peer.origin, { allowInsecureLoopback });
    if (peer.server_name !== undefined && !HOSTNAME.test(peer.server_name)) {
      throw new ValidationError('Circle peer server_name is invalid');
    }
    return {
      origin: peer.origin,
      ...(peer.ca_file !== undefined ? { ca_file: absolutePath(peer.ca_file, 'Circle peer ca_file') } : {}),
      ...(peer.server_name !== undefined ? { server_name: peer.server_name } : {})
    };
  });
  if (new Set(peers.map(peer => peer.origin)).size !== peers.length) {
    throw new ValidationError('Circle peer origins must be unique');
  }
  const interval = value.sync_interval_seconds ?? 300;
  if (!Number.isSafeInteger(interval) || interval < 30 || interval > 86_400) {
    throw new ValidationError('Circle peer sync_interval_seconds must be between 30 and 86400');
  }
  return Object.freeze({
    schema: CIRCLE_PEER_CONFIG_SCHEMA,
    enabled: true,
    genesis_file: absolutePath(value.genesis_file, 'Circle peer genesis_file'),
    member: {
      principal_id: value.member.principal_id,
      private_key_file: absolutePath(value.member.private_key_file, 'Circle peer private_key_file'),
      ...(value.member.disclosure_key_file !== undefined
        ? { disclosure_key_file: absolutePath(value.member.disclosure_key_file, 'Circle peer disclosure_key_file') }
        : {})
    },
    state_file: absolutePath(value.state_file, 'Circle peer state_file'),
    state_key_file: absolutePath(value.state_key_file, 'Circle peer state_key_file'),
    listen,
    peers,
    sync_interval_seconds: interval
  });
}

async function acquireStateLock(stateFile) {
  const path = `${stateFile}.lock`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, token: randomUUID() }));
      await handle.close();
      let released = false;
      return {
        release: async () => {
          if (released) return;
          released = true;
          await rm(path, { force: true });
        }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let owner;
      try {
        owner = JSON.parse(await readFile(path, 'utf8'));
      } catch {
        owner = null;
      }
      if (attempt === 0 && owner && !processIsActive(owner.pid)) {
        await rm(path, { force: true });
        continue;
      }
      throw new ValidationError('Circle peer state is in use by another process');
    }
  }
  throw new ValidationError('Circle peer state is in use by another process');
}

function processIsActive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function isNetworkError(error) {
  return typeof error?.code === 'string' && /^(E[A-Z]+|ERR_[A-Z_]+|UNABLE_TO_|DEPTH_ZERO|SELF_SIGNED|CERT_)/.test(error.code);
}

function stateContext(genesisDigest) {
  return `axiom:circle-peer-state:${genesisDigest}`;
}

async function privateFile(path, maximumBytes, label) {
  return regularFile(path, maximumBytes, label, { requirePrivate: true });
}

async function regularFile(path, maximumBytes, label, { requirePrivate = false } = {}) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new ValidationError(`${label} must be a bounded regular file`);
  }
  if (requirePrivate && process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
    throw new ValidationError(`${label} must not be accessible by group or others`);
  }
  return readFile(path, 'utf8');
}

async function atomicReplace(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { mode, flag: 'wx' });
  await rename(temporary, path);
}

function absolutePath(value, name) {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new ValidationError(`${name} must be an absolute path`);
  return resolve(value);
}

function allowedKeys(value, keys, label) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new ValidationError(`${label} has an unknown field: ${key}`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
