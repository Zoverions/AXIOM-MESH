import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  assertDocumentationImpact,
  evaluateDocumentationImpact
} from '../src/check-documentation-impact.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

async function read(path) {
  return readFile(resolve(ROOT, path), 'utf8');
}

test('signed release manifest documentation retains the trust and non-authority boundary', async () => {
  const content = await read('docs/operations/SIGNED-RELEASE-INSTALL-MANIFEST.md');
  for (const marker of [
    '## Architectural rule',
    '## Trust bootstrap',
    '## Artifact verification',
    'host_mutation_authorized: false',
    '## AXIOM Host boundary',
    '## Threats covered',
    '## Current non-claims'
  ]) {
    assert.ok(content.includes(marker), `signed release documentation must retain: ${marker}`);
  }
  assert.match(content, /externally supplied trusted-signer|externally supplied trusted signer|externally trusted release signer/i);
  assert.match(content, /does not authorize installation|not permission to alter a machine/i);
  assert.match(content, /artifact_bytes_verified: false/);
  assert.match(content, /axiom-host-image-does-not-prove-secure-or-measured-boot/);
});

test('release-install implementation requires all synchronized documentation families', () => {
  const result = evaluateDocumentationImpact([
    'mesh/src/lib/install-release-manifest.mjs',
    'docs/operations/SIGNED-RELEASE-INSTALL-MANIFEST.md',
    'docs/operations/HOST-INSTALLATION-PROFILES.md',
    'README.md',
    'docs/releases/0.12.0-dev.3.md'
  ]);
  assert.equal(result.valid, true);
  const rule = result.triggered_rules.find(item => item.id === 'release-install-manifest-surface');
  assert.ok(rule);
  assert.deepEqual(rule.required_groups.map(group => group.satisfied), [true, true, true, true]);
});

test('release-install implementation cannot omit public or operational release documentation', () => {
  assert.throws(
    () => assertDocumentationImpact([
      'mesh/config/install-release-manifest-policy.json',
      'docs/operations/SIGNED-RELEASE-INSTALL-MANIFEST.md',
      'docs/releases/0.12.0-dev.3.md'
    ]),
    /release-install-manifest-surface\/host-install-operations|release-install-manifest-surface\/public-entry/
  );
});
