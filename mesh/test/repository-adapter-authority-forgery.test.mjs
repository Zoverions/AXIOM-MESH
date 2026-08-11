import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  REPOSITORY_ADAPTER_OPERATION_SCHEMA,
  REPOSITORY_ADAPTER_SCHEMA,
  authorizeRepositoryAdapterOperation,
  normalizeRepositoryAdapterDescriptor,
  normalizeRepositoryAdapterOperation
} from '../src/lib/repository-adapter.mjs';

function adapter() {
  return normalizeRepositoryAdapterDescriptor({
    schema: REPOSITORY_ADAPTER_SCHEMA,
    adapter_id: 'mirror.writable-test',
    repository_id: 'axiom-mesh',
    transport: 'bare_git',
    locator: 'file:test-bare-repository',
    vcs: 'git',
    object_format: 'sha1',
    operations: ['file.write', 'mirror.publish'],
    source_identity_authority: false,
    lineage_acceptance_authority: false,
    credentials_are_identity: false,
    provider_metadata_is_authority: false,
    operation_authority_required: true
  });
}

test('a writable adapter and a valid operation still cannot self-assert execution authority', () => {
  const descriptor = adapter();
  const raw = {
    schema: REPOSITORY_ADAPTER_OPERATION_SCHEMA,
    adapter_digest: descriptor.descriptor_digest,
    repository_id: descriptor.repository_id,
    operation: 'file.write',
    authority_digest: sha256('external-governed-authority'),
    request_digest: sha256('exact-write-request'),
    issued_at: '2026-08-11T16:30:00.000Z',
    expires_at: '2026-08-11T16:35:00.000Z'
  };
  const operation = normalizeRepositoryAdapterOperation(raw);
  const admitted = authorizeRepositoryAdapterOperation({
    descriptor,
    operation,
    now: '2026-08-11T16:31:00.000Z'
  });
  assert.equal(admitted.allowed_by_adapter_ceiling, true);
  assert.equal(admitted.execution_authorized, false);

  assert.throws(
    () => normalizeRepositoryAdapterOperation({
      ...raw,
      execution_authorized: true
    }),
    /unsupported fields/
  );
});
