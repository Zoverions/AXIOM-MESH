import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  buildContextRetrievalPlan
} from '../src/lib/context-retrieval-planner.mjs';
import {
  projectContextVaultCatalogEntry,
  validateSovereignVaultManifest,
  verifyVaultSemanticIndex
} from '../src/lib/vault-catalog-projection.mjs';

const NOW = Date.parse('2026-08-22T18:00:00.000Z');
const CONTENT_SHA = 'a'.repeat(64);

function makeIdentity(service = 'vault-indexer') {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

const indexer = makeIdentity();
const rogueIndexer = makeIdentity('rogue-indexer');

function publicPem(identity) {
  return String(identity.publicKey.export({ type: 'spki', format: 'pem' }));
}

function trust(identity = indexer) {
  return {
    indexer_principal_ref: 'indexer_1',
    key_id: identity.keyId,
    public_key_pem: publicPem(identity)
  };
}

function manifest(overrides = {}) {
  return {
    schema: 'axiom-sovereign-vault.v1',
    vault_id: 'vault_health_1',
    owner_subject_ref: 'owner_1',
    domain: 'health-accessibility',
    sensitivity_ceiling: 'restricted',
    key_domain_ref: 'key_domain_health_1',
    storage_policy: {
      primary_custody: 'owner-local',
      encrypted_at_rest: true,
      plaintext_index_outside_vault: false
    },
    access_policy: {
      default_external_vault_access: false,
      local_companion_access: 'lease-read-derive',
      local_lease_required: true,
      max_local_lease_seconds: 300,
      cross_vault_synthesis: true,
      raw_external_disclosure: false,
      mutation_requires_kernel_effect: true,
      allowed_purposes: ['choose an accessible hotel'],
      high_risk_disclosure_requires_owner_confirmation: true
    },
    recovery_policy: {
      independently_recoverable: true,
      cross_vault_key_dependency: false,
      backup_refs: ['backup_health_1']
    },
    content_manifest_ref: 'content_manifest_health_1',
    content_manifest_sha256: CONTENT_SHA,
    created_at: '2026-08-20T12:00:00.000Z',
    updated_at: '2026-08-22T12:00:00.000Z',
    secret_material_in_manifest: false,
    ...overrides
  };
}

function capabilities() {
  return [{
    semantic_type: 'travel.accessibility.requirements',
    resource_refs: ['record_accessibility_1'],
    sensitivity: 'sensitive',
    operations: ['derive']
  }];
}

function semanticIndex({
  identity = indexer,
  vaultId = 'vault_health_1',
  owner = 'owner_1',
  contentRef = 'content_manifest_health_1',
  contentSha = CONTENT_SHA,
  generatedAt = '2026-08-22T17:00:00.000Z',
  semanticCapabilities = capabilities()
} = {}) {
  const unsigned = {
    schema: 'axiom-vault-semantic-index.v1',
    index_id: 'semantic_index_health_1',
    vault_id: vaultId,
    owner_subject_ref: owner,
    content_manifest_ref: contentRef,
    content_manifest_sha256: contentSha,
    generated_at: generatedAt,
    indexer_principal_ref: 'indexer_1',
    semantic_capabilities: structuredClone(semanticCapabilities)
  };
  return {
    ...unsigned,
    attestation: identity.signObject(unsigned)
  };
}

function request() {
  return {
    schema: 'axiom-context-request.v1',
    request_id: 'request_1',
    owner_subject_ref: 'owner_1',
    requester_principal_ref: 'assistant_1',
    recipient_principal_ref: 'travel_agent_1',
    purpose: 'choose an accessible hotel',
    task_class: 'travel.hotel-selection',
    issued_at: '2026-08-22T17:30:00.000Z',
    expires_at: '2026-08-22T19:00:00.000Z',
    semantic_needs: [{
      semantic_type: 'travel.accessibility.requirements',
      need: 'minimum accessibility constraints',
      required: true,
      maximum_sensitivity: 'restricted',
      acceptable_disclosure_modes: ['transformed-constraint'],
      minimum_confidence: 0.8
    }],
    retention_request: {
      max_seconds: 600,
      recipient_may_persist_requested: false
    },
    minimum_necessary_requested: true,
    source_vault_selector_in_request: false,
    requests_vault_mount: false,
    requests_raw_vault_object: false,
    grants_vault_access: false,
    grants_execution_authority: false,
    onward_disclosure_requested: false
  };
}

function project(options = {}) {
  return projectContextVaultCatalogEntry({
    vaultManifest: options.vaultManifest ?? manifest(),
    semanticIndex: options.semanticIndex ?? semanticIndex(),
    trustedIndexer: options.trustedIndexer ?? trust(),
    now: options.now ?? NOW
  });
}

function validationError(pattern) {
  return error => {
    assert.equal(error?.name, 'ValidationError');
    assert.match(error.message, pattern);
    return true;
  };
}

test('signed exact-content index projects a local-only planner catalog entry', () => {
  const result = project();

  assert.equal(result.catalog_entry.schema, 'axiom-context-vault-catalog-entry.v1');
  assert.equal(result.catalog_entry.vault_id, 'vault_health_1');
  assert.equal(result.catalog_entry.owner_subject_ref, 'owner_1');
  assert.deepEqual(result.catalog_entry.semantic_capabilities, capabilities());
  assert.equal(result.catalog_entry.secret_material_in_catalog, false);
  assert.equal(result.provenance.content_manifest_sha256, CONTENT_SHA);
  assert.equal(result.provenance.semantic_index_signature_verified, true);
  assert.equal(result.provenance.indexer_key_id, indexer.keyId);
  assert.equal(result.local_only, true);
  assert.equal(result.recipient_visible, false);
  assert.equal(result.contains_raw_vault_content, false);
  assert.equal(result.contains_secret_material, false);
  assert.equal(result.reads_vaults, false);
  assert.equal(result.issues_leases, false);
  assert.equal(result.grants_vault_access, false);
  assert.equal(result.grants_execution_authority, false);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /BEGIN PRIVATE KEY/);
  assert.doesNotMatch(serialized, /"signature":/);
});

test('projected catalog feeds the deterministic minimum-necessary retrieval planner', () => {
  const projected = project();
  const plan = buildContextRetrievalPlan({
    request: request(),
    vaultCatalog: [projected.catalog_entry],
    brokerPrincipalRef: 'broker_1',
    createdAt: '2026-08-22T18:00:00.000Z'
  });

  assert.equal(plan.need_plans.length, 1);
  assert.equal(plan.need_plans[0].vault_id, 'vault_health_1');
  assert.deepEqual(plan.need_plans[0].resource_refs, ['record_accessibility_1']);
  assert.equal(plan.need_plans[0].requested_operation, 'derive');
  assert.equal(plan.issues_leases, false);
  assert.equal(plan.grants_vault_access, false);
});

test('content manifest, vault, and owner bindings must match exactly', () => {
  assert.throws(
    () => project({
      semanticIndex: semanticIndex({ contentSha: 'b'.repeat(64) })
    }),
    validationError(/exact governed vault content manifest/)
  );
  assert.throws(
    () => project({
      semanticIndex: semanticIndex({ vaultId: 'vault_other_1' })
    }),
    validationError(/exact governed vault content manifest/)
  );
  assert.throws(
    () => project({
      semanticIndex: semanticIndex({ owner: 'owner_other_1' })
    }),
    validationError(/exact governed vault content manifest/)
  );
});

test('semantic index capability tampering after signature fails closed', () => {
  const index = semanticIndex();
  index.semantic_capabilities[0].resource_refs.push('record_diagnosis_1');
  assert.throws(
    () => project({ semanticIndex: index }),
    validationError(/signature is invalid/)
  );
});

test('rogue key and key-id substitution cannot authenticate the local semantic index', () => {
  assert.throws(
    () => project({
      semanticIndex: semanticIndex({ identity: rogueIndexer })
    }),
    validationError(/key does not match local trust pin/)
  );

  assert.throws(
    () => project({
      trustedIndexer: {
        indexer_principal_ref: 'indexer_1',
        key_id: indexer.keyId,
        public_key_pem: publicPem(rogueIndexer)
      }
    }),
    validationError(/signature is invalid/)
  );
});

test('index cannot claim operations above the governed local-companion access mode', () => {
  const readOnlyManifest = manifest({
    access_policy: {
      ...manifest().access_policy,
      local_companion_access: 'lease-read',
      raw_external_disclosure: true
    }
  });
  assert.throws(
    () => project({
      vaultManifest: readOnlyManifest,
      semanticIndex: semanticIndex({
        semanticCapabilities: [{
          semantic_type: 'travel.accessibility.requirements',
          resource_refs: ['record_accessibility_1'],
          sensitivity: 'sensitive',
          operations: ['derive']
        }]
      })
    }),
    validationError(/operation not permitted/)
  );
});

test('manifest security invariants remain fail-closed before projection', () => {
  const plaintextIndex = manifest({
    storage_policy: {
      ...manifest().storage_policy,
      plaintext_index_outside_vault: true
    }
  });
  assert.throws(
    () => validateSovereignVaultManifest(plaintextIndex),
    validationError(/plaintext index outside/)
  );

  assert.throws(
    () => validateSovereignVaultManifest(manifest({
      secret_material_in_manifest: true
    })),
    validationError(/cannot contain secret material/)
  );

  const missingContentBinding = manifest();
  delete missingContentBinding.content_manifest_ref;
  delete missingContentBinding.content_manifest_sha256;
  assert.throws(
    () => project({ vaultManifest: missingContentBinding }),
    validationError(/content manifest reference and sha256/)
  );
});

test('future semantic index and wrong trusted principal fail closed', () => {
  assert.throws(
    () => verifyVaultSemanticIndex(
      semanticIndex({ generatedAt: '2026-08-22T19:00:00.000Z' }),
      { trustedIndexer: trust(), now: NOW }
    ),
    validationError(/generated in the future/)
  );

  assert.throws(
    () => project({
      trustedIndexer: {
        ...trust(),
        indexer_principal_ref: 'different_indexer'
      }
    }),
    validationError(/signer principal does not match/)
  );
});

test('missing high-risk confirmation flag projects conservatively as required', () => {
  const value = manifest();
  delete value.access_policy.high_risk_disclosure_requires_owner_confirmation;
  const result = project({ vaultManifest: value });
  assert.equal(
    result.catalog_entry.high_risk_disclosure_requires_owner_confirmation,
    true
  );
});
