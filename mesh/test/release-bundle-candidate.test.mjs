import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildReleaseBundleCandidate,
  writeReleaseBundleCandidate
} from '../src/release-bundle-candidate.mjs';
import { sha256, ValidationError } from '../src/lib/canonical.mjs';

const REVISION = '1'.repeat(40);
const CREATED_AT = '2026-10-23T20:00:00.000Z';

function artifacts() {
  return [
    ['source-archive', 'source.archive', 'application/x-tar', 'any', 'source bytes'],
    ['oci-image', 'kernel.oci.linux-amd64', 'application/x-tar', 'linux/amd64', 'image bytes'],
    ['documentation-bundle', 'documentation.bundle', 'application/x-tar', 'any', 'docs bytes'],
    ['sbom', 'release.sbom', 'application/spdx+json', 'any', 'sbom bytes'],
    ['provenance', 'release.provenance', 'application/json', 'any', 'provenance bytes']
  ].map(([kind, artifact_id, media_type, platform, value]) => ({
    kind,
    artifact_id,
    media_type,
    platform,
    bytes: Buffer.from(value)
  }));
}

test('exact-byte CI release bundle inventory is deterministic and non-authorizing', () => {
  const first = buildReleaseBundleCandidate({
    sourceRevision: REVISION,
    kernelVersion: '0.12.0-dev.3',
    createdAt: CREATED_AT,
    artifacts: artifacts()
  });
  const second = buildReleaseBundleCandidate({
    sourceRevision: REVISION,
    kernelVersion: '0.12.0-dev.3',
    createdAt: CREATED_AT,
    artifacts: artifacts().reverse()
  });

  assert.deepEqual(first, second);
  assert.equal(first.schema, 'axiom-ci-release-bundle-candidate.v0');
  assert.equal(first.status, 'non-authorizing-ci-candidate');
  assert.equal(first.source_revision, REVISION);
  assert.equal(first.release_ready, false);
  assert.equal(first.production_promoted, false);
  assert.equal(first.release_signature_verified, false);
  assert.equal(first.install_release_manifest_present, false);
  assert.equal(first.host_mutation_authorized, false);
  assert.equal(first.authority_effect, 'none');
  assert.equal(first.network_effect, 'none');
  assert.match(first.inventory_digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.artifacts.map(item => item.kind), [
    'documentation-bundle',
    'oci-image',
    'provenance',
    'sbom',
    'source-archive'
  ]);
  assert.equal(
    first.artifacts.find(item => item.kind === 'oci-image').sha256,
    sha256(Buffer.from('image bytes'))
  );
  assert.ok(Object.isFrozen(first));
  assert.ok(first.artifacts.every(Object.isFrozen));
});

test('bundle candidate requires one exact artifact of every release evidence kind', () => {
  for (const kind of ['source-archive', 'oci-image', 'documentation-bundle', 'sbom', 'provenance']) {
    assert.throws(
      () => buildReleaseBundleCandidate({
        sourceRevision: REVISION,
        kernelVersion: '0.12.0-dev.3',
        createdAt: CREATED_AT,
        artifacts: artifacts().filter(item => item.kind !== kind)
      }),
      error => error instanceof ValidationError && /artifact inventory/i.test(error.message)
    );
  }

  const duplicate = artifacts();
  duplicate.push({ ...duplicate[0], artifact_id: 'source.archive.second' });
  assert.throws(
    () => buildReleaseBundleCandidate({
      sourceRevision: REVISION,
      kernelVersion: '0.12.0-dev.3',
      createdAt: CREATED_AT,
      artifacts: duplicate
    }),
    /artifact inventory/i
  );
});

test('standard bundle candidate rejects authority-sensitive artifact identities and hostile shape drift', () => {
  for (const token of ['birth', 'genesis', 'spark']) {
    const changed = artifacts();
    changed[0] = { ...changed[0], artifact_id: `source.${token}.archive` };
    assert.throws(
      () => buildReleaseBundleCandidate({
        sourceRevision: REVISION,
        kernelVersion: '0.12.0-dev.3',
        createdAt: CREATED_AT,
        artifacts: changed
      }),
      /Birth|Genesis|Spark/i
    );
  }

  const withClaim = artifacts();
  withClaim[0] = { ...withClaim[0], production_promoted: true };
  assert.throws(
    () => buildReleaseBundleCandidate({
      sourceRevision: REVISION,
      kernelVersion: '0.12.0-dev.3',
      createdAt: CREATED_AT,
      artifacts: withClaim
    }),
    /unsupported field/i
  );
});

test('writer inventories real files and emits no artifact bytes or secrets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'axiom-release-bundle-candidate-'));
  const inputs = [];
  for (const item of artifacts()) {
    const path = join(directory, `${item.artifact_id}.bin`);
    await writeFile(path, item.bytes, { mode: 0o600 });
    inputs.push({
      artifact_id: item.artifact_id,
      kind: item.kind,
      media_type: item.media_type,
      platform: item.platform,
      path
    });
  }
  const output = join(directory, 'inventory.json');
  const result = await writeReleaseBundleCandidate({
    sourceRevision: REVISION,
    kernelVersion: '0.12.0-dev.3',
    createdAt: CREATED_AT,
    artifacts: inputs,
    output
  });
  const written = JSON.parse(await readFile(output, 'utf8'));
  assert.deepEqual(written, result);
  assert.doesNotMatch(JSON.stringify(written), /source bytes|image bytes|PRIVATE KEY|token/i);
  assert.equal(written.release_ready, false);
});
