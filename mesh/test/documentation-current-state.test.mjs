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
  'README.md',
  'docs/README.md',
  'docs/MASTER-TODO.md',
  'docs/PROJECT-STATUS-2026.md',
  'docs/PRODUCTION-READINESS-TRACKER.md',
  'docs/rebuild/SOURCE-TRACEABILITY.md',
  'docs/releases/0.12.0-dev.3.md',
  'docs/whitepapers_and_research/WHITEPAPER.md'
]);

const RESOLVER_STATE_DOCUMENTS = Object.freeze([
  'README.md',
  'docs/MASTER-TODO.md',
  'docs/PROJECT-STATUS-2026.md',
  'docs/PRODUCTION-READINESS-TRACKER.md',
  'docs/rebuild/SOURCE-TRACEABILITY.md',
  'docs/releases/0.12.0-dev.3.md',
  'docs/whitepapers_and_research/WHITEPAPER.md'
]);

const EVIDENCE_STATE_DOCUMENTS = Object.freeze([
  'README.md',
  'docs/README.md',
  'docs/PROJECT-STATUS-2026.md',
  'docs/PRODUCTION-READINESS-TRACKER.md',
  'docs/rebuild/SOURCE-TRACEABILITY.md',
  'docs/releases/0.12.0-dev.3.md',
  'docs/whitepapers_and_research/WHITEPAPER.md'
]);

const OPERATOR_STATE_DOCUMENTS = Object.freeze([
  'README.md',
  'docs/MASTER-TODO.md',
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
  'Agent Runtime Adapter'
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
    assert.match(content, /production-?\s*unreachable/i, relativePath);
  }
});

test('current-state documents distinguish resolver preparation from production reachability', async () => {
  for (const relativePath of RESOLVER_STATE_DOCUMENTS) {
    const content = await read(relativePath);
    assert.match(content, /repository\.docs\.pull-request\.create|repository[^\n]{0,80}(draft )?pull request/i, relativePath);
    assert.match(content, /production-?\s*unreachable/i, relativePath);
    assert.match(content, /approval\.consumed|approval[^\n]{0,80}consum/i, relativePath);
    assert.match(content, /external\.effect\.prepared|prepared[^\n]{0,80}effect/i, relativePath);
  }
});

test('release notes do not regress to superseded machine-principal non-claims', async () => {
  const content = await read('docs/releases/0.12.0-dev.3.md');

  assert.doesNotMatch(
    content,
    /machine-specific destination, rate, concurrency, request-size, or\s+response-size enforcement beyond current global controls/i
  );
  assert.doesNotMatch(content, /fields are not current live-enforcement claims/i);

  for (const marker of ['request-size', 'request-rate', 'concurrency', 'response-size', '/v1/machine-discovery']) {
    assert.ok(content.includes(marker), `release notes must include current machine claim: ${marker}`);
  }
  assert.match(content, /finite[^\n]{0,60}destination|destination[^\n]{0,60}finite/i);
  assert.match(content, /Grid-attested[^\n]{0,80}(machine )?receipts?/i);
});

test('evidence documents preserve the modification versus truncation distinction', async () => {
  for (const relativePath of EVIDENCE_STATE_DOCUMENTS) {
    const content = await read(relativePath);
    assert.ok(content.includes('axiom-grid-continuity-anchor.v1'), relativePath);
    assert.match(content, /truncat|deleted suffix|removed suffix/i, relativePath);
    assert.match(content, /newest retained anchor|through[^\n]{0,80}(retained )?anchor/i, relativePath);
  }
});

test('repository-effect docs describe the built draft-PR operator without granting production or merge authority', async () => {
  for (const relativePath of OPERATOR_STATE_DOCUMENTS) {
    const content = await read(relativePath);
    assert.match(content, /repository[^\n]{0,100}operator|docs-only[^\n]{0,80}operator/i, relativePath);
    assert.match(content, /draft[^\n]{0,60}(PR|pull request)|pull request[^\n]{0,60}draft/i, relativePath);
    assert.match(content, /no[^\n]{0,60}merge|merge[^\n]{0,60}(false|authority|not)|without[^\n]{0,60}merge/i, relativePath);
    assert.match(content, /production-?\s*unreachable|not[^\n]{0,80}production[^\n]{0,80}(reachable|exposed|enabled)/i, relativePath);
  }
});

test('runtime-adapter documentation remains a contract claim rather than external-runtime certification', async () => {
  for (const relativePath of CURRENT_STATE_DOCUMENTS) {
    const content = await read(relativePath);
    assert.match(content, /Agent Runtime Adapter v1/i, relativePath);
    assert.match(
      content,
      /no[^\n]*runtime|does not[^\n]*certif|not[^\n]*certif|synthetic reference/i,
      relativePath
    );
  }
});
