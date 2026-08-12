import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

async function read(relativePath) {
  return readFile(resolve(ROOT, relativePath), 'utf8');
}

const CURRENT_STATE_DOCUMENTS = Object.freeze([
  'docs/README.md',
  'docs/PROJECT-STATUS-2026.md',
  'docs/PRODUCTION-READINESS-TRACKER.md',
  'docs/rebuild/SOURCE-TRACEABILITY.md',
  'docs/releases/0.12.0-dev.3.md',
  'docs/whitepapers_and_research/WHITEPAPER.md'
]);

const REQUIRED_CURRENT_STATE_MARKERS = Object.freeze([
  '0.12.0-dev.3',
  'machine',
  'continuity',
  'Agent Runtime Adapter',
  'production-unreachable'
]);

test('current-state documents retain the August authority and evidence boundaries', async () => {
  for (const relativePath of CURRENT_STATE_DOCUMENTS) {
    const content = await read(relativePath);
    for (const marker of REQUIRED_CURRENT_STATE_MARKERS) {
      assert.ok(
        content.includes(marker),
        `${relativePath} must retain current-state marker: ${marker}`
      );
    }
  }
});

test('current-state documents distinguish resolver preparation from production reachability', async () => {
  for (const relativePath of [
    'docs/PROJECT-STATUS-2026.md',
    'docs/PRODUCTION-READINESS-TRACKER.md',
    'docs/rebuild/SOURCE-TRACEABILITY.md',
    'docs/releases/0.12.0-dev.3.md',
    'docs/whitepapers_and_research/WHITEPAPER.md'
  ]) {
    const content = await read(relativePath);
    assert.ok(content.includes('repository.docs.pull-request.create'), relativePath);
    assert.match(content, /production[- ]unreachable/i, relativePath);
    assert.match(content, /approval\.consumed/, relativePath);
    assert.match(content, /external\.effect\.prepared/, relativePath);
  }
});

test('release notes do not regress to superseded machine-principal non-claims', async () => {
  const content = await read('docs/releases/0.12.0-dev.3.md');

  assert.doesNotMatch(
    content,
    /machine-specific destination, rate, concurrency, request-size, or\s+response-size enforcement beyond current global controls/i
  );
  assert.doesNotMatch(
    content,
    /fields are not current live-enforcement claims/i
  );

  for (const marker of [
    'request-size',
    'request-rate',
    'concurrency',
    'response-size',
    'finite destination',
    '/v1/machine-discovery',
    'Grid-attested terminal machine receipts'
  ]) {
    assert.ok(content.includes(marker), `release notes must include current machine claim: ${marker}`);
  }
});

test('evidence documents preserve the modification versus truncation distinction', async () => {
  for (const relativePath of [
    'docs/README.md',
    'docs/PROJECT-STATUS-2026.md',
    'docs/PRODUCTION-READINESS-TRACKER.md',
    'docs/rebuild/SOURCE-TRACEABILITY.md',
    'docs/releases/0.12.0-dev.3.md',
    'docs/whitepapers_and_research/WHITEPAPER.md'
  ]) {
    const content = await read(relativePath);
    assert.ok(content.includes('axiom-grid-continuity-anchor.v1'), relativePath);
    assert.match(content, /truncation/i, relativePath);
  }
});

test('runtime-adapter documentation remains a contract claim rather than external-runtime certification', async () => {
  for (const relativePath of [
    'docs/README.md',
    'docs/PROJECT-STATUS-2026.md',
    'docs/PRODUCTION-READINESS-TRACKER.md',
    'docs/rebuild/SOURCE-TRACEABILITY.md',
    'docs/releases/0.12.0-dev.3.md',
    'docs/whitepapers_and_research/WHITEPAPER.md'
  ]) {
    const content = await read(relativePath);
    assert.match(content, /Agent Runtime Adapter v1/i, relativePath);
    assert.match(content, /(no|not).*external runtime|does not.*certif|certification.*not|no.*certif/is, relativePath);
  }
});
