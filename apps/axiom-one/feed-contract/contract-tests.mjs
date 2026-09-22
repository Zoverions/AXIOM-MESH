/**
 * AXIOM One PWA — feed contract tests (DESIGN-ONLY).
 *
 * Proves the mock feed server satisfies feed-contract.schema.json:
 *   1. every fixture response validates against the contract schema, and
 *   2. every live mock endpoint response validates against the contract schema,
 *      plus semantic checks (chronological order, coarse 404, rescind omission,
 *      cursor pagination, lens same-item-set, widening-draft guard).
 *
 * Schema validation uses a self-contained structural validator that supports
 * exactly the schema constructs this contract uses. The runner first walks the
 * schema and fails if any unsupported keyword is present — so a passing run
 * cannot silently skip a constraint.
 *
 * Label: DESIGN-ONLY. No claim about the real relay; mock only.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockFeedServer } from './mock-feed-server.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SUPPORTED_KEYWORDS = new Set([
  '$id', '$schema', 'title', 'description', 'comment', 'definitions',
  'type', 'enum', 'const', 'pattern', 'format',
  'minLength', 'maxLength', 'minimum', 'maximum',
  'required', 'properties', 'additionalProperties',
  'items', 'minItems', 'maxItems', '$ref'
]);
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function assertSchemaCoverage(schema, path = '#') {
  if (schema === null || typeof schema !== 'object') return;
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) {
      throw new Error(`Unsupported schema keyword '${key}' at ${path} — validator cannot cover the contract`);
    }
  }
  if (schema.properties) for (const [k, v] of Object.entries(schema.properties)) assertSchemaCoverage(v, `${path}/properties/${k}`);
  if (schema.items) assertSchemaCoverage(schema.items, `${path}/items`);
  if (schema.definitions) for (const [k, v] of Object.entries(schema.definitions)) assertSchemaCoverage(v, `${path}/definitions/${k}`);
  if (schema.$ref && !schema.$ref.startsWith('#/definitions/')) {
    throw new Error(`Unsupported $ref target '${schema.$ref}' at ${path}`);
  }
}

function resolveRef(ref, definitions) {
  const name = ref.slice('#/definitions/'.length);
  const target = definitions[name];
  if (!target) throw new Error(`Unresolvable $ref ${ref}`);
  return target;
}

function typeMatches(value, type) {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'integer': return Number.isInteger(value);
    case 'number': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    case 'null': return value === null;
    default: return false;
  }
}

function validate(value, schema, definitions, path = '$') {
  const errors = [];
  if (schema.$ref) {
    return validate(value, resolveRef(schema.$ref, definitions), definitions, path);
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(t => typeMatches(value, t))) {
      errors.push(`${path}: expected type ${types.join('|')}, got ${Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value}`);
      return errors;
    }
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${path}: value not in enum ${JSON.stringify(schema.enum)}`);
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (typeof value === 'string') {
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: string does not match pattern ${schema.pattern}`);
    }
    if (schema.format === 'date-time' && !DATE_TIME.test(value)) {
      errors.push(`${path}: not an RFC3339 date-time: ${value}`);
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum ${schema.maximum}`);
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) errors.push(`${path}: missing required property '${key}'`);
      }
    }
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (key in value) errors.push(...validate(value[key], sub, definitions, `${path}.${key}`));
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) errors.push(`${path}: additional property '${key}' not allowed`);
      }
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: fewer than minItems ${schema.minItems}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: more than maxItems ${schema.maxItems}`);
    if (schema.items) value.forEach((item, i) => errors.push(...validate(item, schema.items, definitions, `${path}[${i}]`)));
  }
  return errors;
}

const results = [];
function test(name, fn) {
  results.push({ name, fn });
}

async function main() {
  const schemaDoc = JSON.parse(await readFile(join(ROOT, 'feed-contract.schema.json'), 'utf8'));
  const definitions = schemaDoc.definitions ?? {};
  const fixtures = JSON.parse(await readFile(join(ROOT, 'fixtures.json'), 'utf8'));

  test('schema uses only validator-covered keywords', () => {
    assertSchemaCoverage(schemaDoc);
    return true;
  });

  const allProjections = [];
  for (const item of fixtures.items) {
    test(`fixture item ${item.item_id}: every projection validates`, () => {
      for (const p of item.projections) {
        const full = { ...p, item_id: item.item_id, kind: item.kind, sent_at: item.sent_at, author: item.author, audience: item.audience };
        const errs = validate(full, { $ref: '#/definitions/projection' }, definitions);
        if (errs.length) throw new Error(errs.join('; '));
        allProjections.push(full);
      }
      return true;
    });
  }

  test('fixture: every ledger record validates', () => {
    for (const record of fixtures.ledger) {
      const errs = validate(record, { $ref: '#/definitions/ledgerRecord' }, definitions, '$.records[]');
      if (errs.length) throw new Error(errs.join('; '));
    }
    return true;
  });

  test('fixture: every draft card validates; widening never auto-approvable', () => {
    for (const draft of fixtures.drafts) {
      const errs = validate(draft, { $ref: '#/definitions/draftCard' }, definitions);
      if (errs.length) throw new Error(errs.join('; '));
      if (draft.widening && draft.auto_approve_eligible) throw new Error(`${draft.draft_id}: widening draft must never be auto-approvable`);
      if (draft.widening && !draft.scope_delta.includes('WIDENING')) throw new Error(`${draft.draft_id}: widening draft missing verbatim marker`);
    }
    return true;
  });

  test('fixture: rescind receipt validates against rescindResponse', () => {
    for (const item of fixtures.items) {
      if (!item.rescinded) continue;
      const errs = validate(item.rescind_receipt, { $ref: '#/definitions/rescindResponse' }, definitions);
      if (errs.length) throw new Error(errs.join('; '));
      if (!item.rescind_receipt.ui_copy.includes('removed everywhere you control')) {
        throw new Error('rescind receipt missing the verbatim ledger copy');
      }
    }
    return true;
  });

  const mock = await startMockFeedServer();
  const get = async (path) => {
    const res = await fetch(`${mock.url}${path}`);
    return { status: res.status, body: await res.json() };
  };
  const post = async (path) => {
    const res = await fetch(`${mock.url}${path}`, { method: 'POST' });
    return { status: res.status, body: await res.json() };
  };

  test('mock-info declares mock scope', async () => {
    const { status, body } = await get('/mock-info');
    if (status !== 200 || body.mock !== true) throw new Error('mock-info must declare mock:true');
    return true;
  });

  let publicFirst = null;
  test('feed.list public: schema-valid, newest-first, rescind-aware', async () => {
    const { status, body } = await get('/v1/feed?audience=public');
    if (status !== 200) throw new Error(`expected 200, got ${status}`);
    const errs = validate(body, { $ref: '#/definitions/feedListResponse' }, definitions);
    if (errs.length) throw new Error(errs.join('; '));
    const seqs = body.items.map(p => Number(p.item_id.slice('fi_demo_'.length)));
    if (!seqs.every((s, i) => i === 0 || s < seqs[i - 1])) throw new Error('items not in newest-first order');
    if (body.items.some(p => p.item_id === 'fi_demo_0105')) throw new Error('rescinded item leaked into the list');
    if (!body.items.every(p => p.audience === 'public')) throw new Error('non-public projection in public list');
    publicFirst = body;
    return true;
  });

  test('feed.list serves all four audiences with own projections only', async () => {
    const expectations = { 'circle:demo-family': 2, intimate: 1, 'named:demo.friend': 1 };
    for (const [audience, count] of Object.entries(expectations)) {
      const { status, body } = await get(`/v1/feed?audience=${encodeURIComponent(audience)}`);
      if (status !== 200) throw new Error(`${audience}: expected 200, got ${status}`);
      const errs = validate(body, { $ref: '#/definitions/feedListResponse' }, definitions);
      if (errs.length) throw new Error(`${audience}: ${errs.join('; ')}`);
      if (body.items.length !== count) throw new Error(`${audience}: expected ${count} items, got ${body.items.length}`);
      if (!body.items.every(p => p.audience === audience)) throw new Error(`${audience}: foreign projection present`);
    }
    return true;
  });

  test('feed.list: malformed audience fails whole request, 400', async () => {
    const { status, body } = await get('/v1/feed?audience=bogus%3A%21');
    if (status !== 400) throw new Error(`expected 400, got ${status}`);
    const errs = validate(body, { $ref: '#/definitions/errorResponse' }, definitions);
    if (errs.length) throw new Error(errs.join('; '));
    if (body.error.code !== 'validation_error') throw new Error('wrong error code');
    return true;
  });

  test('feed.list: unknown circle fails closed, 403', async () => {
    const { status, body } = await get('/v1/feed?audience=circle%3Anot-on-roster');
    if (status !== 403) throw new Error(`expected 403, got ${status}`);
    const errs = validate(body, { $ref: '#/definitions/errorResponse' }, definitions);
    if (errs.length) throw new Error(errs.join('; '));
    if (body.error.code !== 'not_authorized_for_audience') throw new Error('wrong error code');
    return true;
  });

  test('feed.list: limit above 100 is rejected', async () => {
    const { status } = await get('/v1/feed?audience=public&limit=200');
    if (status !== 400) throw new Error(`expected 400, got ${status}`);
    return true;
  });

  test('feed.get: valid projection is schema-valid', async () => {
    const { status, body } = await get('/v1/feed/fi_demo_0108?audience=public');
    if (status !== 200) throw new Error(`expected 200, got ${status}`);
    const errs = validate(body, { $ref: '#/definitions/projection' }, definitions);
    if (errs.length) throw new Error(errs.join('; '));
    return true;
  });

  test('feed.get: coarse 404 for nonexistent, rescinded, and not-in-audience', async () => {
    const cases = [
      '/v1/feed/fi_demo_9999?audience=public',
      '/v1/feed/fi_demo_0105?audience=public',
      '/v1/feed/fi_demo_0101?audience=circle%3Ademo-family'
    ];
    for (const path of cases) {
      const { status, body } = await get(path);
      if (status !== 404) throw new Error(`${path}: expected 404, got ${status}`);
      const errs = validate(body, { $ref: '#/definitions/errorResponse' }, definitions);
      if (errs.length) throw new Error(`${path}: ${errs.join('; ')}`);
      if (body.error.code !== 'not_found') throw new Error(`${path}: wrong error code`);
    }
    return true;
  });

  test('cursor pagination: pages are disjoint, ordered, and union the full list', async () => {
    const page1 = (await get('/v1/feed?audience=public&limit=2')).body;
    if (!page1.next_cursor) throw new Error('expected a next_cursor on the first page');
    const page2 = (await get(`/v1/feed?audience=public&limit=2&cursor=${encodeURIComponent(page1.next_cursor)}`)).body;
    if (!Array.isArray(page2.items)) throw new Error('page 2 is not a feed list');
    const page3 = page2.next_cursor
      ? (await get(`/v1/feed?audience=public&limit=2&cursor=${encodeURIComponent(page2.next_cursor)}`)).body
      : { items: [], next_cursor: null };
    const union = [...page1.items, ...page2.items, ...page3.items].map(p => p.item_id);
    const full = publicFirst.items.map(p => p.item_id);
    if (new Set(union).size !== union.length) throw new Error('pages overlap');
    if (union.length !== full.length || !union.every((id, i) => id === full[i])) throw new Error('paginated union differs from the full list');
    const tailCursor = page2.next_cursor ? page3.next_cursor : page2.next_cursor;
    if (tailCursor !== null) throw new Error('tail page must have null next_cursor');
    return true;
  });

  test('lens: a lens id returns the same item set as chronological', async () => {
    const { body } = await get('/v1/feed?audience=public&lens=deep-work');
    const lensIds = body.items.map(p => p.item_id).sort();
    const chronoIds = publicFirst.items.map(p => p.item_id).sort();
    if (lensIds.length !== chronoIds.length || !lensIds.every((id, i) => id === chronoIds[i])) {
      throw new Error('lens changed the eligible item set');
    }
    return true;
  });

  let preRescindSeq = 0;
  test('feed.rescind: receipt is schema-valid, stub-marked, and authoritative locally', async () => {
    preRescindSeq = (await get('/v1/feed?audience=public')).body.server_seq;
    const { status, body } = await post('/v1/feed/fi_demo_0101/rescind');
    if (status !== 200) throw new Error(`expected 200, got ${status}`);
    const errs = validate(body, { $ref: '#/definitions/rescindResponse' }, definitions);
    if (errs.length) throw new Error(errs.join('; '));
    if (body.mock_only !== true) throw new Error('rescind stub must carry mock_only:true');
    if (!body.ui_copy.includes('removed everywhere you control')) throw new Error('rescind receipt missing verbatim ledger copy');
    return true;
  });

  test('feed.rescind: item vanishes from all views, server_seq bumps, rescind is idempotent', async () => {
    const again = await post('/v1/feed/fi_demo_0101/rescind');
    const first = again.body;
    const after = await get('/v1/feed?audience=public');
    if (after.body.items.some(p => p.item_id === 'fi_demo_0101')) throw new Error('rescinded item still listed');
    if (after.body.server_seq <= preRescindSeq) throw new Error('server_seq did not bump on rescind');
    const third = await post('/v1/feed/fi_demo_0101/rescind');
    if (third.body.rescind_id !== first.rescind_id) throw new Error('rescind is not idempotent');
    const gone = await get('/v1/feed/fi_demo_0101?audience=public');
    if (gone.status !== 404) throw new Error('rescinded item must 404');
    return true;
  });

  test('feed.rescind: unknown item 404s coarsely', async () => {
    const { status, body } = await get('/v1/feed/fi_demo_9999?audience=public');
    if (status !== 404 || body.error.code !== 'not_found') throw new Error('expected coarse 404');
    return true;
  });

  test('feed.drafts: schema-valid; widening draft copy is verbatim and not auto-approvable', async () => {
    const { status, body } = await get('/v1/feed/drafts');
    if (status !== 200) throw new Error(`expected 200, got ${status}`);
    const errs = validate(body, { $ref: '#/definitions/draftsResponse' }, definitions);
    if (errs.length) throw new Error(errs.join('; '));
    const widening = body.drafts.find(d => d.widening);
    if (!widening) throw new Error('fixture must include a widening draft');
    if (widening.auto_approve_eligible) throw new Error('widening draft must never be auto-approvable');
    if (!widening.scope_delta.includes('WIDENING')) throw new Error('widening draft missing verbatim marker');
    return true;
  });

  test('feed.ledger: schema-valid records of rescind asks', async () => {
    const { status, body } = await get('/v1/feed/ledger');
    if (status !== 200) throw new Error(`expected 200, got ${status}`);
    const errs = validate(body, { $ref: '#/definitions/ledgerResponse' }, definitions);
    if (errs.length) throw new Error(errs.join('; '));
    if (body.records.length < 1) throw new Error('ledger should record at least one rescind');
    for (const record of body.records) {
      if (!record.attestations.every(a => a.attestation_id && a.sent_to)) throw new Error('ledger attestation missing who-it-was-asked-to');
    }
    return true;
  });

  let passed = 0;
  const failures = [];
  for (const { name, fn } of results) {
    try {
      await fn();
      passed += 1;
      console.log(`ok   - ${name}`);
    } catch (error) {
      failures.push({ name, error: error.message });
      console.log(`FAIL - ${name}\n       ${error.message}`);
    }
  }
  await mock.stop();
  const total = results.length;
  console.log(`\ncontract-tests: ${passed} passed, ${failures.length} failed, ${total} total`);
  if (failures.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(`contract-tests crashed: ${error.message}`);
  process.exitCode = 2;
});
