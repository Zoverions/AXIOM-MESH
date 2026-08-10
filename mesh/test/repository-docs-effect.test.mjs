import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import * as protocol from '../src/lib/repository-docs-effect.mjs';

const NOW = '2026-08-10T22:30:00.000Z';
const BASE_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);
const OLD_BLOB = 'c'.repeat(40);
const OLD_CONTENT = '# Old\n';
const NEW_CONTENT = '# Current capability status\n\nGenerated evidence.\n';
const D = character => character.repeat(64);

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function fixtures() {
  const operator = identity('repository-operator');
  const hypervisor = identity('hypervisor');
  const change = {
    path: 'docs/rebuild/STATUS.md',
    operation: 'update',
    old_blob_sha: OLD_BLOB,
    old_content_sha256: sha256(OLD_CONTENT),
    new_content: NEW_CONTENT
  };
  const plan = protocol.buildRepositoryDocsEffectPlan({
    identity: operator,
    base_sha: BASE_SHA,
    changes: [change],
    planned_at: NOW,
    expires_at: '2026-08-10T22:35:00.000Z'
  });
  const prepared = protocol.buildPreparedRepositoryDocsEffect({
    identity: hypervisor,
    plan,
    operatorPublicKey: operator.publicKey,
    source_bindings: {
      intent_id: 'intent-docs-1',
      intent_digest: D('1'),
      handoff_digest: D('2'),
      remediation_proposal_id: `intent-remediation:${D('3')}`,
      remediation_proposal_digest: D('3'),
      principal: 'operator-human',
      machine_authority_digest: null
    },
    authority_bindings: {
      policy_digest: D('4'),
      capability_registry_digest: D('5'),
      executor_registry_digest: D('6'),
      mapping_digest: D('7'),
      build_digest: D('8')
    },
    one_use_nonce: 'effect_nonce_0123456789',
    prepared_at: '2026-08-10T22:30:30.000Z',
    expires_at: '2026-08-10T22:35:00.000Z'
  });
  const applied_files = [{
    path: change.path,
    new_content_sha256: sha256(NEW_CONTENT),
    observed_blob_sha: HEAD_SHA
  }];
  const receipt = protocol.buildRepositoryDocsEffectReceipt({
    identity: operator,
    prepared_effect: prepared,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    head_sha: HEAD_SHA,
    pull_request_number: 1001,
    pull_request_id: 'PR_docs_1001',
    applied_files,
    observed_at: '2026-08-10T22:31:00.000Z'
  });
  return { operator, hypervisor, change, plan, prepared, receipt, applied_files };
}

test('docs-only repository effect plan is deterministic, signed, and read-only', () => {
  const operator = identity('repository-operator');
  const args = {
    identity: operator,
    base_sha: BASE_SHA,
    changes: [{
      path: 'docs/rebuild/STATUS.md',
      operation: 'update',
      old_blob_sha: OLD_BLOB,
      old_content_sha256: sha256(OLD_CONTENT),
      new_content: NEW_CONTENT
    }],
    planned_at: NOW,
    expires_at: '2026-08-10T22:35:00.000Z'
  };
  const first = protocol.buildRepositoryDocsEffectPlan(args);
  const second = protocol.buildRepositoryDocsEffectPlan(args);
  assert.deepEqual(first, second);
  const verified = protocol.verifyRepositoryDocsEffectPlan(first, {
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T22:31:00.000Z'
  });
  assert.equal(verified.repository, 'Zoverions/AXIOM-MESH');
  assert.equal(verified.base_branch, 'main');
  assert.equal(verified.read_only_observation, true);
  assert.equal(verified.mutations_performed, false);
  assert.equal(verified.changes[0].new_content_sha256, sha256(NEW_CONTENT));
  assert.equal(verified.changes[0].new_bytes, Buffer.byteLength(NEW_CONTENT));
});

test('docs-only ceiling rejects source workflow config deletion rename binary and traversal changes', () => {
  const operator = identity('repository-operator');
  const base = {
    identity: operator,
    base_sha: BASE_SHA,
    planned_at: NOW,
    expires_at: '2026-08-10T22:35:00.000Z'
  };
  for (const path of [
    'mesh/src/status.mjs',
    '.github/workflows/kernel.yml',
    'mesh/config/policy.json',
    'docs/../mesh/config/policy.json',
    '/docs/absolute.md',
    'docs//double.md'
  ]) {
    assert.throws(() => protocol.buildRepositoryDocsEffectPlan({
      ...base,
      changes: [{ path, operation: 'create', new_content: 'safe text\n' }]
    }), /path|ceiling|canonical/);
  }
  assert.throws(() => protocol.buildRepositoryDocsEffectPlan({
    ...base,
    changes: [{ path: 'docs/delete.md', operation: 'delete', new_content: '' }]
  }), /operation|pattern/);
  assert.throws(() => protocol.buildRepositoryDocsEffectPlan({
    ...base,
    changes: [{ path: 'docs/rename.md', operation: 'rename', new_content: 'x' }]
  }), /operation|pattern/);
  assert.throws(() => protocol.buildRepositoryDocsEffectPlan({
    ...base,
    changes: [{ path: 'docs/binary.md', operation: 'create', new_content: 'a\u0000b' }]
  }), /binary|NUL/);
});

test('duplicate paths, stale plans, old-content ambiguity, and wrong signer fail closed', () => {
  const operator = identity('repository-operator');
  const attacker = identity('repository-operator');
  const change = { path: 'docs/new.md', operation: 'create', new_content: 'new\n' };
  assert.throws(() => protocol.buildRepositoryDocsEffectPlan({
    identity: operator,
    base_sha: BASE_SHA,
    changes: [change, change],
    planned_at: NOW,
    expires_at: '2026-08-10T22:35:00.000Z'
  }), /unique/);
  assert.throws(() => protocol.buildRepositoryDocsEffectPlan({
    identity: operator,
    base_sha: BASE_SHA,
    changes: [{ ...change, old_blob_sha: OLD_BLOB }],
    planned_at: NOW,
    expires_at: '2026-08-10T22:35:00.000Z'
  }), /old blob/);
  const plan = protocol.buildRepositoryDocsEffectPlan({
    identity: operator,
    base_sha: BASE_SHA,
    changes: [change],
    planned_at: NOW,
    expires_at: '2026-08-10T22:35:00.000Z'
  });
  assert.throws(() => protocol.verifyRepositoryDocsEffectPlan(plan, {
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T22:36:00.000Z'
  }), /expired/);
  assert.throws(() => protocol.verifyRepositoryDocsEffectPlan(plan, {
    operatorPublicKey: attacker.publicKey,
    now: '2026-08-10T22:31:00.000Z'
  }), /signature/);
});

test('prepared effect binds exact plan remediation authority and one-use nonce without execution authority', () => {
  const { operator, hypervisor, prepared } = fixtures();
  const verified = protocol.verifyPreparedRepositoryDocsEffect(prepared, {
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T22:31:00.000Z'
  });
  assert.equal(verified.semantic_action, 'repo.docs.update');
  assert.equal(verified.target_action, 'repository.docs.pull-request.create');
  assert.equal(verified.tool, 'adapter.repository-docs-pr');
  assert.equal(verified.external_effect_executed, false);
  assert.equal(verified.execution_authorized, false);
  assert.equal(verified.merge_authorized, false);
  assert.equal(verified.plan.read_only_observation, true);
  assert.equal(protocol.repositoryDocsEffectBranch(verified.effect_digest), `axiom/intent-docs-${verified.effect_digest.slice(0, 20)}`);
});

test('re-addressing a tampered prepared effect cannot forge the hypervisor signature', () => {
  const { operator, hypervisor, prepared } = fixtures();
  const tampered = structuredClone(prepared);
  tampered.source_bindings.principal = 'attacker';
  const { effect_id: ignoredId, effect_digest: ignoredDigest, attestation, ...body } = tampered;
  const nextDigest = digestObject(body);
  tampered.effect_digest = nextDigest;
  tampered.effect_id = `effect:${nextDigest}`;
  tampered.attestation = attestation;
  assert.throws(() => protocol.verifyPreparedRepositoryDocsEffect(tampered, {
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T22:31:00.000Z'
  }), /signature/);
});

test('repository operator receipt proves exact PR proposal without merge or remediation convergence', () => {
  const { operator, hypervisor, prepared, receipt } = fixtures();
  const verified = protocol.verifyRepositoryDocsEffectReceipt(receipt, {
    prepared_effect: prepared,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T22:32:00.000Z'
  });
  assert.equal(verified.external_effect_executed, true);
  assert.equal(verified.pull_request_created_observed, true);
  assert.equal(verified.merge_performed, false);
  assert.equal(verified.base_branch_content_changed, false);
  assert.equal(verified.execution_authorized, false);
  assert.equal(verified.remediation_converged, false);
  assert.equal(verified.branch, protocol.repositoryDocsEffectBranch(prepared.effect_digest));
  assert.deepEqual(verified.applied_files.map(file => file.path), ['docs/rebuild/STATUS.md']);
});

test('receipt rejects wrong post state, extra files, wrong branch, wrong identity, and stale prepared effect', () => {
  const { operator, hypervisor, prepared, applied_files } = fixtures();
  const attacker = identity('repository-operator');
  const valid = {
    identity: operator,
    prepared_effect: prepared,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    head_sha: HEAD_SHA,
    pull_request_number: 1001,
    pull_request_id: 'PR_docs_1001',
    applied_files,
    observed_at: '2026-08-10T22:31:00.000Z'
  };
  assert.throws(() => protocol.buildRepositoryDocsEffectReceipt({
    ...valid,
    applied_files: [{ ...applied_files[0], new_content_sha256: D('9') }]
  }), /content digest/);
  assert.throws(() => protocol.buildRepositoryDocsEffectReceipt({
    ...valid,
    applied_files: [...applied_files, {
      path: 'docs/extra.md',
      new_content_sha256: sha256('extra'),
      observed_blob_sha: 'd'.repeat(40)
    }]
  }), /exactly cover/);
  assert.throws(
    () => protocol.buildRepositoryDocsEffectReceipt({ ...valid, identity: attacker }),
    /signer must match/
  );
  assert.throws(() => protocol.buildRepositoryDocsEffectReceipt({
    ...valid,
    observed_at: '2026-08-10T22:36:00.000Z'
  }), /expired/);
});

test('receipt signature and content address reject forged status claims', () => {
  const { operator, hypervisor, prepared, receipt } = fixtures();
  const forged = structuredClone(receipt);
  forged.merge_performed = true;
  const { receipt_id: ignoredId, receipt_digest: ignoredDigest, attestation, ...body } = forged;
  const nextDigest = digestObject(body);
  forged.receipt_digest = nextDigest;
  forged.receipt_id = `receipt:${nextDigest}`;
  forged.attestation = attestation;
  assert.throws(() => protocol.verifyRepositoryDocsEffectReceipt(forged, {
    prepared_effect: prepared,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T22:32:00.000Z'
  }), /authority|status|signature/);
});

test('protocol module exposes no repository apply write merge or shell function', () => {
  const forbidden = Object.keys(protocol).filter(name => /(^|Repository)(apply|write|merge|shell|execute)/i.test(name));
  assert.deepEqual(forbidden, []);
  assert.equal(protocol.REPOSITORY_DOCS_EFFECT_POLICY.allow_merge, false);
  assert.equal(protocol.REPOSITORY_DOCS_EFFECT_POLICY.allow_delete, false);
  assert.equal(protocol.REPOSITORY_DOCS_EFFECT_POLICY.allow_rename, false);
});
