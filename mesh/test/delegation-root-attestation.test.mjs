import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  DELEGATION_AUTHORITY_SCHEMA,
  DELEGATION_GRANT_SCHEMA
} from '../src/lib/delegation-graph.mjs';
import {
  appendDelegationGrant,
  readDelegationLedger
} from '../src/lib/delegation-ledger.mjs';

const NOW = new Date('2026-08-28T04:00:00.000Z');

function authority(holder) {
  return {
    schema: DELEGATION_AUTHORITY_SCHEMA,
    holder,
    actions: ['memory.read'],
    purposes: ['research.assist'],
    data_scopes: ['project.public'],
    destinations: ['local'],
    budgets: {
      max_requests_per_minute: 20,
      max_concurrent_requests: 1,
      max_execution_ms: 5_000,
      max_request_bytes: 131_072,
      max_response_bytes: 524_288
    },
    required_assurance: 'A2',
    independent_approval_required: false,
    delegation: { allowed: true, max_depth: 1 },
    expires_at: '2026-09-30T00:00:00.000Z'
  };
}

function grant(root) {
  return {
    schema: DELEGATION_GRANT_SCHEMA,
    id: 'grant.reader',
    delegator: root.holder,
    delegate: 'agent.reader',
    parent_grant_id: null,
    issued_at: '2026-08-28T03:30:00.000Z',
    authority: {
      ...root,
      holder: 'agent.reader',
      delegation: { allowed: false, max_depth: 0 },
      expires_at: '2026-09-10T00:00:00.000Z'
    }
  };
}

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-delegation-root-attestation-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const ledgerPath = join(dir, 'delegation.jsonl');
  const root = authority('owner.alice');
  await appendDelegationGrant({
    ledger_path: ledgerPath,
    root_authority: root,
    grant: grant(root),
    now: NOW
  });
  const ledger = await readDelegationLedger({ ledger_path: ledgerPath });
  return { root, binding: ledger.root_binding };
}

async function loadAttestationModule() {
  try {
    return await import('../src/lib/delegation-root-attestation.mjs');
  } catch (error) {
    assert.fail(`delegation root attestation module must exist: ${error.message}`);
  }
}

test('root attestation signs the exact durable root binding without granting authority', async t => {
  const { root, binding } = await fixture(t);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const {
    DELEGATION_ROOT_ATTESTATION_SCHEMA,
    createDelegationRootAttestation,
    verifyDelegationRootAttestation
  } = await loadAttestationModule();

  const attestation = createDelegationRootAttestation({
    root_binding: binding,
    signer_id: root.holder,
    signer_private_key: privateKey,
    issued_at: NOW.toISOString()
  });

  assert.equal(attestation.schema, DELEGATION_ROOT_ATTESTATION_SCHEMA);
  assert.equal(attestation.statement.root_binding_digest, binding.binding_digest);
  assert.equal(attestation.statement.root_authority_digest, binding.root_authority_digest);
  assert.equal(attestation.statement.root_holder, binding.root_holder);
  assert.equal(attestation.statement.signer_id, binding.root_holder);
  assert.equal(attestation.statement.authority_effect, 'none');
  assert.equal(attestation.statement.delegation_effect, 'none');
  assert.equal(attestation.statement.execution_authority_granted, false);
  assert.equal(attestation.statement.global_currentness_claimed, false);
  assert.match(attestation.statement.signer_key_id, /^[a-f0-9]{64}$/);
  assert.match(attestation.statement_digest, /^[a-f0-9]{64}$/);
  assert.match(attestation.signer_signature, /^[A-Za-z0-9_-]+$/);
  assert.match(attestation.attestation_digest, /^[a-f0-9]{64}$/);

  const verified = verifyDelegationRootAttestation(attestation, {
    trusted_signer_public_key: publicKey,
    expected_root_binding_digest: binding.binding_digest,
    expected_root_authority_digest: binding.root_authority_digest,
    expected_signer_id: binding.root_holder
  });
  assert.deepEqual(verified, attestation);
});

test('root attestation verification rejects trusted-key substitution', async t => {
  const { binding } = await fixture(t);
  const signer = generateKeyPairSync('ed25519');
  const substitute = generateKeyPairSync('ed25519');
  const {
    createDelegationRootAttestation,
    verifyDelegationRootAttestation
  } = await loadAttestationModule();

  const attestation = createDelegationRootAttestation({
    root_binding: binding,
    signer_id: binding.root_holder,
    signer_private_key: signer.privateKey,
    issued_at: NOW.toISOString()
  });

  assert.throws(
    () => verifyDelegationRootAttestation(attestation, {
      trusted_signer_public_key: substitute.publicKey,
      expected_root_binding_digest: binding.binding_digest,
      expected_root_authority_digest: binding.root_authority_digest,
      expected_signer_id: binding.root_holder
    }),
    /key substitution|signature/i
  );
});

test('root attestation verification fails closed on statement or signature tampering', async t => {
  const { binding } = await fixture(t);
  const signer = generateKeyPairSync('ed25519');
  const {
    createDelegationRootAttestation,
    verifyDelegationRootAttestation
  } = await loadAttestationModule();

  const attestation = createDelegationRootAttestation({
    root_binding: binding,
    signer_id: binding.root_holder,
    signer_private_key: signer.privateKey,
    issued_at: NOW.toISOString()
  });

  const tamperedStatement = structuredClone(attestation);
  tamperedStatement.statement.root_binding_digest = '0'.repeat(64);
  assert.throws(
    () => verifyDelegationRootAttestation(tamperedStatement, {
      trusted_signer_public_key: signer.publicKey
    }),
    /statement digest|binding/i
  );

  const tamperedSignature = structuredClone(attestation);
  tamperedSignature.signer_signature = `${attestation.signer_signature.slice(0, -1)}A`;
  assert.throws(
    () => verifyDelegationRootAttestation(tamperedSignature, {
      trusted_signer_public_key: signer.publicKey
    }),
    /signature/i
  );
});

test('root attestation verification rejects replay against another root binding', async t => {
  const { binding } = await fixture(t);
  const signer = generateKeyPairSync('ed25519');
  const {
    createDelegationRootAttestation,
    verifyDelegationRootAttestation
  } = await loadAttestationModule();

  const attestation = createDelegationRootAttestation({
    root_binding: binding,
    signer_id: binding.root_holder,
    signer_private_key: signer.privateKey,
    issued_at: NOW.toISOString()
  });

  assert.throws(
    () => verifyDelegationRootAttestation(attestation, {
      trusted_signer_public_key: signer.publicKey,
      expected_root_binding_digest: 'f'.repeat(64)
    }),
    /root binding digest mismatch/i
  );
});

test('v1 root attestation may only be signed for the bound root holder', async t => {
  const { binding } = await fixture(t);
  const signer = generateKeyPairSync('ed25519');
  const { createDelegationRootAttestation } = await loadAttestationModule();

  assert.throws(
    () => createDelegationRootAttestation({
      root_binding: binding,
      signer_id: 'agent.other',
      signer_private_key: signer.privateKey,
      issued_at: NOW.toISOString()
    }),
    /signer.*root holder|root holder.*signer/i
  );
});
