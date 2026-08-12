import {
  createPublicKey,
  generateKeyPairSync
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from './lib/canonical.mjs';
import { MeshIdentity, verifyObjectSignature } from './lib/identity.mjs';
import {
  RUNTIME_ADAPTER_CONTRACT_ID,
  RUNTIME_ADAPTER_CONTRACT_SCHEMA,
  RUNTIME_ADAPTER_CONTRACT_SHA256,
  RUNTIME_ADAPTER_CONTRACT_VERSION,
  verifyRuntimeAdapterContract
} from './lib/runtime-adapter-contract.mjs';

export const REFERENCE_ADAPTER_SCHEMA = RUNTIME_ADAPTER_CONTRACT_SCHEMA;
export const REFERENCE_RECEIPT_SCHEMA =
  'axiom-runtime-adapter-synthetic-receipt.v1';
export const REFERENCE_EVIDENCE_SCHEMA =
  'axiom-runtime-adapter-reference-conformance-evidence.v1';

const KERNEL_VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;
const REVISION = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const CHECK_NAMES = Object.freeze([
  'contract_digest_pinned',
  'manifest_is_fail_closed',
  'installation_grants_no_authority',
  'unsigned_grant_rejected',
  'grant_replay_rejected',
  'grant_single_use_enforced',
  'valid_synthetic_request_completed',
  'no_external_effect_claimed',
  'missing_grant_denied',
  'unknown_operation_denied',
  'action_mismatch_denied',
  'scope_widening_denied',
  'destination_widening_denied',
  'credential_widening_denied',
  'future_grant_denied',
  'expired_grant_denied',
  'revoked_grant_denied',
  'midflight_revocation_preempted',
  'cancellation_preempted',
  'idempotent_replay_stable',
  'idempotency_conflict_denied',
  'same_grant_fallback_denied',
  'fresh_fallback_grant_accepted',
  'transport_loss_marked_uncertain',
  'malformed_request_rejected',
  'receipt_tampering_rejected',
  'receipt_excludes_secret_material',
  'production_conformance_not_claimed'
]);

const TOP_LEVEL_MANIFEST_FIELDS = Object.freeze([
  'schema',
  'contract',
  'adapter_id',
  'adapter_version',
  'runtime',
  'implementation',
  'compatibility',
  'authority',
  'capability_translation',
  'data_handling',
  'execution',
  'evidence',
  'lifecycle'
]);

const REQUEST_FIELDS = Object.freeze([
  'schema',
  'request_id',
  'principal_id',
  'runtime_operation',
  'axiom_action',
  'input_sha256',
  'requested_scopes',
  'destinations',
  'credential_handles',
  'idempotency_key',
  'grant_id',
  'fallback_from_grant_id',
  'simulation'
]);

const GRANT_FIELDS = Object.freeze([
  'schema',
  'grant_id',
  'principal_id',
  'adapter_id',
  'runtime_id',
  'axiom_action',
  'scopes',
  'destinations',
  'credential_handles',
  'issued_at',
  'expires_at',
  'status',
  'fallback_from_grant_id',
  'attestation'
]);

export function createSyntheticReferenceAdapterManifest({
  sourceRevision = '0'.repeat(40)
} = {}) {
  if (!REVISION.test(sourceRevision)) {
    throw new ValidationError('Reference adapter source revision is invalid');
  }
  return {
    schema: REFERENCE_ADAPTER_SCHEMA,
    contract: {
      contract_id: RUNTIME_ADAPTER_CONTRACT_ID,
      contract_version: RUNTIME_ADAPTER_CONTRACT_VERSION,
      contract_sha256: RUNTIME_ADAPTER_CONTRACT_SHA256
    },
    adapter_id: 'axiom.reference.noop',
    adapter_version: '1.0.0-synthetic.1',
    runtime: {
      runtime_id: 'axiom.synthetic.reference-runtime',
      project_name: 'AXIOM Synthetic Reference Runtime',
      source_repository: 'https://github.com/Zoverions/AXIOM-MESH',
      source_commit: sourceRevision,
      release_ref: 'synthetic-conformance-only',
      license_spdx: 'Apache-2.0',
      upstream_supported: false,
      integration_modes: ['sidecar']
    },
    implementation: {
      artifact_ref: 'synthetic://axiom/reference-runtime-adapter',
      artifact_sha256: sha256(`reference-adapter\n${sourceRevision}`),
      sbom_sha256: sha256(`reference-adapter-sbom\n${sourceRevision}`),
      entrypoint: 'mesh/src/runtime-adapter-conformance.mjs'
    },
    compatibility: {
      capsule_schema_ids: ['axiom-agent-runtime-capsule.v1'],
      gateway_contracts: [{
        contract_id: 'axiom-gateway-client-contract',
        contract_version: '1.0.0',
        contract_sha256: sha256('synthetic-reference-gateway-contract')
      }],
      source_pin_required: true,
      mutable_ref_allowed: false
    },
    authority: {
      principal_id: 'runtime:synthetic-reference',
      authority_source: 'axiom-gateway',
      requested_capabilities: ['adapter.reference.echo'],
      install_grants_authority: false,
      runtime_may_self_authorize: false,
      runtime_approvals_are_authoritative: false,
      grant_required_before_effect: true,
      grant_signature_algorithm: 'Ed25519',
      grant_key_pin_required: true,
      grant_replay_protection: true,
      grant_single_use: true,
      maximum_grant_lifetime_ms: 60_000,
      authorization_recheck_before_effect: true,
      revocation_preempts_runtime: true,
      deny_unknown_effects: true,
      receipts_required: true
    },
    capability_translation: {
      unmapped_behavior: 'deny',
      mappings: [{
        runtime_operation: 'reference.echo',
        axiom_action: 'adapter.reference.echo',
        effect_class: 'read',
        input_schema_ref: 'synthetic://schemas/reference-echo-input.v1',
        output_schema_ref: 'synthetic://schemas/reference-echo-output.v1',
        requested_scopes: ['synthetic.read'],
        destinations: ['local:reference'],
        credential_handles: ['credential:synthetic-reference']
      }]
    },
    data_handling: {
      accepted_data_classes: ['synthetic-public'],
      allowed_egress_destinations: [],
      secret_transport: 'opaque-handle-only',
      raw_content_telemetry: false,
      cross_scope_memory: false,
      retention: {
        mode: 'ephemeral',
        maximum_seconds: 0
      },
      deletion: {
        supported: true,
        maximum_completion_ms: 1000,
        receipt_required: true
      }
    },
    execution: {
      sandbox_required: true,
      direct_host_tool_access: false,
      direct_credential_access: false,
      request_timeout_ms: 1000,
      maximum_request_bytes: 4096,
      maximum_response_bytes: 4096,
      maximum_concurrency: 1,
      cancellation: {
        supported: true,
        acknowledgement_deadline_ms: 100
      },
      retry: {
        maximum_attempts: 1,
        backoff_ms: 0,
        side_effect_retry_requires_idempotency_key: true
      },
      failure_mode: 'deny',
      unknown_outcome: 'uncertain',
      fallback_requires_new_grant: true
    },
    evidence: {
      receipt_schema_ref: REFERENCE_RECEIPT_SCHEMA,
      bind_source_commit: true,
      bind_contract: true,
      bind_manifest: true,
      bind_artifact_digest: true,
      bind_adapter: true,
      bind_runtime: true,
      bind_grant: true,
      bind_request: true,
      bind_effect: true,
      bind_outcome: true,
      record_provider: true,
      record_model: true,
      record_cost: true,
      record_latency: true,
      record_fallback: true,
      raw_chain_of_thought_required: false,
      outcome_states: [
        'completed',
        'denied',
        'failed',
        'timed-out',
        'cancelled',
        'revoked',
        'uncertain'
      ]
    },
    lifecycle: {
      revocation_supported: true,
      state_export_supported: true,
      rollback_supported: true,
      uninstall_supported: true,
      cleanup_targets: [
        'credential-handles',
        'network-sessions',
        'cached-data',
        'background-workers',
        'pending-effects'
      ],
      orphaned_effect_behavior: 'reconcile-before-retry'
    }
  };
}

export function validateSyntheticReferenceAdapterManifest(manifest) {
  verifyRuntimeAdapterContract();
  exactKeys(manifest, 'Reference adapter manifest', TOP_LEVEL_MANIFEST_FIELDS);
  exactKeys(manifest.contract, 'Reference adapter contract pin', [
    'contract_id',
    'contract_version',
    'contract_sha256'
  ]);
  exactKeys(manifest.runtime, 'Reference adapter runtime', [
    'runtime_id',
    'project_name',
    'source_repository',
    'source_commit',
    'release_ref',
    'license_spdx',
    'upstream_supported',
    'integration_modes'
  ]);
  exactKeys(manifest.implementation, 'Reference adapter implementation', [
    'artifact_ref',
    'artifact_sha256',
    'sbom_sha256',
    'entrypoint'
  ]);
  exactKeys(manifest.compatibility, 'Reference adapter compatibility', [
    'capsule_schema_ids',
    'gateway_contracts',
    'source_pin_required',
    'mutable_ref_allowed'
  ]);
  exactKeys(manifest.authority, 'Reference adapter authority', [
    'principal_id',
    'authority_source',
    'requested_capabilities',
    'install_grants_authority',
    'runtime_may_self_authorize',
    'runtime_approvals_are_authoritative',
    'grant_required_before_effect',
    'grant_signature_algorithm',
    'grant_key_pin_required',
    'grant_replay_protection',
    'grant_single_use',
    'maximum_grant_lifetime_ms',
    'authorization_recheck_before_effect',
    'revocation_preempts_runtime',
    'deny_unknown_effects',
    'receipts_required'
  ]);
  exactKeys(manifest.capability_translation, 'Reference adapter translation', [
    'unmapped_behavior',
    'mappings'
  ]);
  exactKeys(manifest.data_handling, 'Reference adapter data handling', [
    'accepted_data_classes',
    'allowed_egress_destinations',
    'secret_transport',
    'raw_content_telemetry',
    'cross_scope_memory',
    'retention',
    'deletion'
  ]);
  exactKeys(manifest.execution, 'Reference adapter execution', [
    'sandbox_required',
    'direct_host_tool_access',
    'direct_credential_access',
    'request_timeout_ms',
    'maximum_request_bytes',
    'maximum_response_bytes',
    'maximum_concurrency',
    'cancellation',
    'retry',
    'failure_mode',
    'unknown_outcome',
    'fallback_requires_new_grant'
  ]);
  exactKeys(manifest.evidence, 'Reference adapter evidence', [
    'receipt_schema_ref',
    'bind_source_commit',
    'bind_contract',
    'bind_manifest',
    'bind_artifact_digest',
    'bind_adapter',
    'bind_runtime',
    'bind_grant',
    'bind_request',
    'bind_effect',
    'bind_outcome',
    'record_provider',
    'record_model',
    'record_cost',
    'record_latency',
    'record_fallback',
    'raw_chain_of_thought_required',
    'outcome_states'
  ]);
  exactKeys(manifest.lifecycle, 'Reference adapter lifecycle', [
    'revocation_supported',
    'state_export_supported',
    'rollback_supported',
    'uninstall_supported',
    'cleanup_targets',
    'orphaned_effect_behavior'
  ]);
  if (
    !Array.isArray(manifest.compatibility.gateway_contracts)
    || manifest.compatibility.gateway_contracts.length !== 1
  ) throw new ValidationError('Reference adapter Gateway contract pin is invalid');
  exactKeys(
    manifest.compatibility.gateway_contracts[0],
    'Reference adapter Gateway contract pin',
    ['contract_id', 'contract_version', 'contract_sha256']
  );
  exactKeys(manifest.data_handling.retention, 'Reference adapter retention', [
    'mode',
    'maximum_seconds'
  ]);
  exactKeys(manifest.data_handling.deletion, 'Reference adapter deletion', [
    'supported',
    'maximum_completion_ms',
    'receipt_required'
  ]);
  exactKeys(manifest.execution.cancellation, 'Reference adapter cancellation', [
    'supported',
    'acknowledgement_deadline_ms'
  ]);
  exactKeys(manifest.execution.retry, 'Reference adapter retry', [
    'maximum_attempts',
    'backoff_ms',
    'side_effect_retry_requires_idempotency_key'
  ]);

  if (
    manifest.schema !== REFERENCE_ADAPTER_SCHEMA
    || manifest.contract.contract_id !== RUNTIME_ADAPTER_CONTRACT_ID
    || manifest.contract.contract_version !== RUNTIME_ADAPTER_CONTRACT_VERSION
    || manifest.contract.contract_sha256 !== RUNTIME_ADAPTER_CONTRACT_SHA256
    || manifest.adapter_id !== 'axiom.reference.noop'
    || manifest.adapter_version !== '1.0.0-synthetic.1'
    || !REVISION.test(manifest.runtime.source_commit ?? '')
    || !DIGEST.test(manifest.implementation.artifact_sha256 ?? '')
    || !DIGEST.test(manifest.implementation.sbom_sha256 ?? '')
    || manifest.compatibility.source_pin_required !== true
    || manifest.compatibility.mutable_ref_allowed !== false
    || manifest.authority.authority_source !== 'axiom-gateway'
    || manifest.authority.install_grants_authority !== false
    || manifest.authority.runtime_may_self_authorize !== false
    || manifest.authority.runtime_approvals_are_authoritative !== false
    || manifest.authority.grant_required_before_effect !== true
    || manifest.authority.grant_signature_algorithm !== 'Ed25519'
    || manifest.authority.grant_key_pin_required !== true
    || manifest.authority.grant_replay_protection !== true
    || manifest.authority.grant_single_use !== true
    || manifest.authority.maximum_grant_lifetime_ms !== 60_000
    || manifest.authority.authorization_recheck_before_effect !== true
    || manifest.authority.revocation_preempts_runtime !== true
    || manifest.authority.deny_unknown_effects !== true
    || manifest.authority.receipts_required !== true
    || manifest.capability_translation.unmapped_behavior !== 'deny'
    || manifest.data_handling.secret_transport !== 'opaque-handle-only'
    || manifest.data_handling.raw_content_telemetry !== false
    || manifest.data_handling.cross_scope_memory !== false
    || manifest.data_handling.retention.mode !== 'ephemeral'
    || manifest.data_handling.retention.maximum_seconds !== 0
    || manifest.data_handling.deletion.supported !== true
    || manifest.data_handling.deletion.receipt_required !== true
    || manifest.execution.sandbox_required !== true
    || manifest.execution.direct_host_tool_access !== false
    || manifest.execution.direct_credential_access !== false
    || manifest.execution.cancellation.supported !== true
    || manifest.execution.retry.side_effect_retry_requires_idempotency_key !== true
    || manifest.execution.failure_mode !== 'deny'
    || manifest.execution.unknown_outcome !== 'uncertain'
    || manifest.execution.fallback_requires_new_grant !== true
    || manifest.evidence.bind_contract !== true
    || manifest.evidence.bind_manifest !== true
    || manifest.evidence.raw_chain_of_thought_required !== false
    || !manifest.evidence.outcome_states.includes('uncertain')
    || manifest.lifecycle.revocation_supported !== true
    || manifest.lifecycle.state_export_supported !== true
    || manifest.lifecycle.rollback_supported !== true
    || manifest.lifecycle.uninstall_supported !== true
    || manifest.lifecycle.orphaned_effect_behavior !== 'reconcile-before-retry'
  ) throw new ValidationError('Reference adapter manifest is not fail closed');

  if (
    !Array.isArray(manifest.capability_translation.mappings)
    || manifest.capability_translation.mappings.length !== 1
  ) throw new ValidationError('Reference adapter must expose one synthetic mapping');
  const mapping = manifest.capability_translation.mappings[0];
  exactKeys(mapping, 'Reference adapter mapping', [
    'runtime_operation',
    'axiom_action',
    'effect_class',
    'input_schema_ref',
    'output_schema_ref',
    'requested_scopes',
    'destinations',
    'credential_handles'
  ]);
  if (
    mapping.runtime_operation !== 'reference.echo'
    || mapping.axiom_action !== 'adapter.reference.echo'
    || mapping.effect_class !== 'read'
    || canonicalJson(mapping.requested_scopes) !== canonicalJson(['synthetic.read'])
    || canonicalJson(mapping.destinations) !== canonicalJson(['local:reference'])
    || canonicalJson(mapping.credential_handles)
      !== canonicalJson(['credential:synthetic-reference'])
  ) throw new ValidationError('Reference adapter mapping is invalid');
  return true;
}

export function createSyntheticReferenceGrantAuthority() {
  const signer = identity('runtime-adapter-synthetic-gateway');
  return Object.freeze({
    signer,
    verifier: Object.freeze({
      key_id: signer.keyId,
      public_key_pem: publicPem(signer)
    })
  });
}

export class SyntheticReferenceRuntimeAdapter {
  constructor({
    manifest = createSyntheticReferenceAdapterManifest(),
    now = () => Date.now(),
    receiptSigner = identity('runtime-adapter-reference-receipt'),
    grantAuthority
  } = {}) {
    validateSyntheticReferenceAdapterManifest(manifest);
    exactKeys(grantAuthority, 'Synthetic Gateway grant authority', [
      'key_id',
      'public_key_pem'
    ]);
    const grantVerificationKey = parsePublicKey(grantAuthority.public_key_pem);
    if (
      typeof grantAuthority.key_id !== 'string'
      || !grantAuthority.key_id.endsWith(
        `:${sha256(grantAuthority.public_key_pem).slice(0, 16)}`
      )
    ) throw new ValidationError('Synthetic Gateway grant authority is invalid');
    this.manifest = structuredClone(manifest);
    this.now = now;
    this.receiptSigner = receiptSigner;
    this.grantSignerKeyId = grantAuthority.key_id;
    this.grantVerificationKey = grantVerificationKey;
    this.grants = new Map();
    this.revokedGrants = new Set();
    this.consumedGrants = new Map();
    this.cancelledRequests = new Set();
    this.idempotency = new Map();
  }

  install() {
    return Object.freeze({
      installed: true,
      authority_granted: false,
      external_runtime_loaded: false,
      external_effects_enabled: false
    });
  }

  registerGrant(grant) {
    validateGrant(grant);
    const unsigned = structuredClone(grant);
    delete unsigned.attestation;
    if (
      grant.attestation.key_id !== this.grantSignerKeyId
      || !verifyObjectSignature(unsigned, grant.attestation, this.grantVerificationKey)
    ) throw new ValidationError('Grant signature is invalid');
    if (
      grant.adapter_id !== this.manifest.adapter_id
      || grant.runtime_id !== this.manifest.runtime.runtime_id
    ) throw new ValidationError('Grant is not bound to the reference adapter');
    if (
      Date.parse(grant.expires_at) - Date.parse(grant.issued_at)
        > this.manifest.authority.maximum_grant_lifetime_ms
    ) throw new ValidationError('Grant lifetime exceeds the adapter maximum');
    if (this.grants.has(grant.grant_id)) {
      throw new ValidationError('Grant replay is not allowed');
    }
    this.grants.set(grant.grant_id, structuredClone(grant));
    return true;
  }

  revokeGrant(grantId) {
    if (!this.grants.has(grantId)) return false;
    this.revokedGrants.add(grantId);
    return true;
  }

  cancel(requestId) {
    assertId(requestId, 'request_id');
    this.cancelledRequests.add(requestId);
  }

  async execute(request, { beforeEffect } = {}) {
    validateRequest(request);
    const fingerprint = digestObject(request);
    const prior = this.idempotency.get(request.idempotency_key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        return this.#finish(request, {
          state: 'denied',
          code: 'idempotency-conflict',
          mapping: this.#mapping(request.runtime_operation)
        });
      }
      return {
        ...structuredClone(prior.outcome),
        replayed: true
      };
    }

    let authorization = this.#authorize(request);
    if (!authorization.ok) {
      return this.#store(request, fingerprint, this.#finish(request, authorization));
    }
    if (typeof beforeEffect === 'function') {
      await beforeEffect({ adapter: this, request: structuredClone(request) });
    }
    if (this.cancelledRequests.has(request.request_id)) {
      return this.#store(request, fingerprint, this.#finish(request, {
        state: 'cancelled',
        code: 'cancelled-before-effect',
        mapping: authorization.mapping
      }));
    }
    authorization = this.#authorize(request);
    if (!authorization.ok) {
      return this.#store(request, fingerprint, this.#finish(request, authorization));
    }
    this.consumedGrants.set(request.grant_id, request.request_id);

    if (request.simulation === 'transport-loss-after-dispatch') {
      return this.#store(request, fingerprint, this.#finish(request, {
        state: 'uncertain',
        code: 'transport-lost-after-dispatch',
        mapping: authorization.mapping
      }));
    }
    if (request.simulation === 'provider-failed-before-effect') {
      return this.#store(request, fingerprint, this.#finish(request, {
        state: 'failed',
        code: 'synthetic-provider-failure',
        mapping: authorization.mapping
      }));
    }
    return this.#store(request, fingerprint, this.#finish(request, {
      state: 'completed',
      code: 'synthetic-completed',
      mapping: authorization.mapping,
      outputSha256: sha256(`synthetic-reference-output\n${request.input_sha256}`)
    }));
  }

  #mapping(operation) {
    return this.manifest.capability_translation.mappings.find(
      mapping => mapping.runtime_operation === operation
    ) ?? null;
  }

  #authorize(request) {
    const mapping = this.#mapping(request.runtime_operation);
    if (!mapping) return denied('unmapped-operation', mapping);
    if (mapping.axiom_action !== request.axiom_action) {
      return denied('action-mismatch', mapping);
    }
    const grant = this.grants.get(request.grant_id);
    if (!grant) return denied('grant-required', mapping);
    if (grant.status === 'revoked' || this.revokedGrants.has(grant.grant_id)) {
      return { ok: false, state: 'revoked', code: 'grant-revoked', mapping };
    }
    if (grant.status !== 'active') return denied('grant-not-active', mapping);
    if (Date.parse(grant.issued_at) > this.now()) return denied('grant-not-yet-valid', mapping);
    if (Date.parse(grant.expires_at) <= this.now()) return denied('grant-expired', mapping);
    if (
      grant.principal_id !== request.principal_id
      || grant.adapter_id !== this.manifest.adapter_id
      || grant.runtime_id !== this.manifest.runtime.runtime_id
      || grant.axiom_action !== request.axiom_action
    ) return denied('grant-binding-mismatch', mapping);
    if (!subset(request.requested_scopes, mapping.requested_scopes)) {
      return denied('scope-not-mapped', mapping);
    }
    if (!subset(request.destinations, mapping.destinations)) {
      return denied('destination-not-mapped', mapping);
    }
    if (!subset(request.credential_handles, mapping.credential_handles)) {
      return denied('credential-handle-not-mapped', mapping);
    }
    if (!subset(request.requested_scopes, grant.scopes)) {
      return denied('scope-not-granted', mapping);
    }
    if (!subset(request.destinations, grant.destinations)) {
      return denied('destination-not-granted', mapping);
    }
    if (!subset(request.credential_handles, grant.credential_handles)) {
      return denied('credential-handle-not-granted', mapping);
    }
    if (
      request.fallback_from_grant_id === null
        ? grant.fallback_from_grant_id !== null
        : (
          grant.grant_id === request.fallback_from_grant_id
          || grant.fallback_from_grant_id !== request.fallback_from_grant_id
        )
    ) return denied('fresh-fallback-grant-required', mapping);
    const consumedBy = this.consumedGrants.get(grant.grant_id);
    if (consumedBy && consumedBy !== request.request_id) {
      return denied('grant-consumed', mapping);
    }
    return { ok: true, mapping, grant };
  }

  #store(request, fingerprint, outcome) {
    this.idempotency.set(request.idempotency_key, {
      fingerprint,
      outcome: structuredClone(outcome)
    });
    return outcome;
  }

  #finish(request, {
    state,
    code,
    mapping,
    outputSha256 = null
  }) {
    const generatedAt = new Date(this.now()).toISOString();
    const registeredGrant = this.grants.get(request.grant_id);
    const unsigned = {
      schema: REFERENCE_RECEIPT_SCHEMA,
      contract: structuredClone(this.manifest.contract),
      manifest_digest: digestObject(this.manifest),
      generated_at: generatedAt,
      synthetic_fixture: true,
      external_runtime_loaded: false,
      external_effect_performed: false,
      production_conformance_claimed: false,
      source: {
        kernel_version: KERNEL_VERSION,
        revision: this.manifest.runtime.source_commit
      },
      adapter: {
        adapter_id: this.manifest.adapter_id,
        adapter_version: this.manifest.adapter_version,
        artifact_sha256: this.manifest.implementation.artifact_sha256
      },
      runtime: {
        runtime_id: this.manifest.runtime.runtime_id,
        source_commit: this.manifest.runtime.source_commit
      },
      request: {
        request_id: request.request_id,
        principal_id: request.principal_id,
        runtime_operation: request.runtime_operation,
        axiom_action: request.axiom_action,
        input_sha256: request.input_sha256,
        idempotency_key: request.idempotency_key
      },
      grant: {
        grant_id: request.grant_id,
        fallback_from_grant_id: request.fallback_from_grant_id,
        attestation_digest: registeredGrant
          ? digestObject(registeredGrant.attestation)
          : null
      },
      effect: {
        effect_class: mapping?.effect_class ?? null,
        output_sha256: outputSha256
      },
      execution: {
        state,
        code,
        provider: 'synthetic-reference-provider',
        model: 'synthetic-reference-model',
        cost_minor: 0,
        currency: 'USD',
        latency_ms: 0,
        fallback_used: request.fallback_from_grant_id !== null
      },
      signer: {
        key_id: this.receiptSigner.keyId,
        public_key_pem: publicPem(this.receiptSigner)
      }
    };
    const receipt = {
      ...unsigned,
      attestation: this.receiptSigner.signObject(unsigned)
    };
    verifySyntheticReferenceReceipt(receipt);
    return {
      state,
      code,
      replayed: false,
      receipt
    };
  }
}

export function verifySyntheticReferenceReceipt(receipt) {
  exactKeys(receipt, 'Synthetic runtime adapter receipt', [
    'schema',
    'contract',
    'manifest_digest',
    'generated_at',
    'synthetic_fixture',
    'external_runtime_loaded',
    'external_effect_performed',
    'production_conformance_claimed',
    'source',
    'adapter',
    'runtime',
    'request',
    'grant',
    'effect',
    'execution',
    'signer',
    'attestation'
  ]);
  exactKeys(receipt.contract, 'Synthetic runtime adapter receipt contract', [
    'contract_id',
    'contract_version',
    'contract_sha256'
  ]);
  exactKeys(receipt.source, 'Synthetic runtime adapter receipt source', [
    'kernel_version',
    'revision'
  ]);
  exactKeys(receipt.adapter, 'Synthetic runtime adapter receipt adapter', [
    'adapter_id',
    'adapter_version',
    'artifact_sha256'
  ]);
  exactKeys(receipt.runtime, 'Synthetic runtime adapter receipt runtime', [
    'runtime_id',
    'source_commit'
  ]);
  exactKeys(receipt.request, 'Synthetic runtime adapter receipt request', [
    'request_id',
    'principal_id',
    'runtime_operation',
    'axiom_action',
    'input_sha256',
    'idempotency_key'
  ]);
  exactKeys(receipt.grant, 'Synthetic runtime adapter receipt grant', [
    'grant_id',
    'fallback_from_grant_id',
    'attestation_digest'
  ]);
  exactKeys(receipt.effect, 'Synthetic runtime adapter receipt effect', [
    'effect_class',
    'output_sha256'
  ]);
  exactKeys(receipt.execution, 'Synthetic runtime adapter receipt execution', [
    'state',
    'code',
    'provider',
    'model',
    'cost_minor',
    'currency',
    'latency_ms',
    'fallback_used'
  ]);
  exactKeys(receipt.signer, 'Synthetic runtime adapter receipt signer', [
    'key_id',
    'public_key_pem'
  ]);
  exactKeys(receipt.attestation, 'Synthetic runtime adapter receipt attestation', [
    'algorithm',
    'key_id',
    'digest',
    'signature'
  ]);
  if (
    receipt.schema !== REFERENCE_RECEIPT_SCHEMA
    || receipt.contract.contract_id !== RUNTIME_ADAPTER_CONTRACT_ID
    || receipt.contract.contract_version !== RUNTIME_ADAPTER_CONTRACT_VERSION
    || receipt.contract.contract_sha256 !== RUNTIME_ADAPTER_CONTRACT_SHA256
    || !DIGEST.test(receipt.manifest_digest ?? '')
    || !canonicalTimestamp(receipt.generated_at)
    || receipt.synthetic_fixture !== true
    || receipt.external_runtime_loaded !== false
    || receipt.external_effect_performed !== false
    || receipt.production_conformance_claimed !== false
    || !REVISION.test(receipt.source?.revision ?? '')
    || receipt.source.kernel_version !== KERNEL_VERSION
    || !DIGEST.test(receipt.adapter?.artifact_sha256 ?? '')
    || !REVISION.test(receipt.runtime?.source_commit ?? '')
    || !DIGEST.test(receipt.request?.input_sha256 ?? '')
    || (
      receipt.grant?.attestation_digest !== null
      && !DIGEST.test(receipt.grant.attestation_digest ?? '')
    )
    || !['completed', 'denied', 'failed', 'cancelled', 'revoked', 'uncertain']
      .includes(receipt.execution?.state)
    || receipt.execution?.cost_minor !== 0
    || receipt.execution?.currency !== 'USD'
    || receipt.execution?.latency_ms !== 0
    || typeof receipt.execution?.fallback_used !== 'boolean'
    || ![null, 'read'].includes(receipt.effect?.effect_class)
    || (
      receipt.effect?.output_sha256 !== null
      && !DIGEST.test(receipt.effect.output_sha256 ?? '')
    )
  ) throw new ValidationError('Synthetic runtime adapter receipt is invalid');
  const key = parsePublicKey(receipt.signer?.public_key_pem);
  if (
    receipt.signer?.key_id !== receipt.attestation?.key_id
    || !receipt.signer.key_id.endsWith(
      `:${sha256(receipt.signer.public_key_pem).slice(0, 16)}`
    )
  ) throw new ValidationError('Synthetic runtime adapter receipt signer is invalid');
  const unsigned = structuredClone(receipt);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, receipt.attestation, key)) {
    throw new ValidationError('Synthetic runtime adapter receipt signature is invalid');
  }
  return {
    valid: true,
    state: receipt.execution.state,
    external_effect_performed: false,
    production_conformance_claimed: false
  };
}

export async function runRuntimeAdapterReferenceConformance({
  now = Date.UTC(2026, 7, 11, 20, 35, 0),
  sourceRevision = process.env.GITHUB_SHA,
  requireCommitBound = false
} = {}) {
  if (requireCommitBound && !REVISION.test(sourceRevision ?? '')) {
    throw new ValidationError('Commit-bound runtime adapter evidence requires GITHUB_SHA');
  }
  const revision = REVISION.test(sourceRevision ?? '')
    ? sourceRevision
    : '0'.repeat(40);
  const manifest = createSyntheticReferenceAdapterManifest({
    sourceRevision: revision
  });
  const grantAuthority = createSyntheticReferenceGrantAuthority();
  const adapter = new SyntheticReferenceRuntimeAdapter({
    manifest,
    now: () => now,
    grantAuthority: grantAuthority.verifier
  });
  const signedGrant = options => referenceGrant({
    ...options,
    signer: grantAuthority.signer
  });
  const install = adapter.install();
  const principalId = 'principal:synthetic-owner';
  const unsignedGrant = signedGrant({
    grantId: 'grant:unsigned-rejected',
    principalId,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now
  });
  delete unsignedGrant.attestation;
  const unsignedGrantRejected = rejects(() => adapter.registerGrant(unsignedGrant));
  const replayGrant = signedGrant({
    grantId: 'grant:replay-rejected',
    principalId,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now
  });
  adapter.registerGrant(replayGrant);
  const grantReplayRejected = rejects(() => adapter.registerGrant(replayGrant));
  const grant = signedGrant({
    grantId: 'grant:reference-primary',
    principalId,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now
  });
  adapter.registerGrant(grant);
  const rawSecret = 'sk-synthetic-plaintext-must-not-appear';
  const base = referenceRequest({
    requestId: 'request:reference-valid',
    principalId,
    grantId: grant.grant_id,
    idempotencyKey: 'idempotency:reference-valid-0001',
    inputSha256: sha256(`synthetic input\n${rawSecret}`)
  });
  const completed = await adapter.execute(base);
  const replay = await adapter.execute(base);
  const reusedGrant = await adapter.execute(referenceRequest({
    requestId: 'request:reference-reused-grant',
    principalId,
    grantId: grant.grant_id,
    idempotencyKey: 'idempotency:reference-reused-grant-0001'
  }));

  const missingGrant = await adapter.execute(referenceRequest({
    requestId: 'request:missing-grant',
    principalId,
    grantId: 'grant:missing',
    idempotencyKey: 'idempotency:missing-grant-0001'
  }));
  const unknownOperation = await adapter.execute({
    ...referenceRequest({
      requestId: 'request:unknown-operation',
      principalId,
      grantId: grant.grant_id,
      idempotencyKey: 'idempotency:unknown-operation-0001'
    }),
    runtime_operation: 'host.shell',
    axiom_action: 'host.shell'
  });
  const actionMismatch = await adapter.execute({
    ...referenceRequest({
      requestId: 'request:action-mismatch',
      principalId,
      grantId: grant.grant_id,
      idempotencyKey: 'idempotency:action-mismatch-0001'
    }),
    axiom_action: 'adapter.reference.write'
  });
  const scopeWidening = await adapter.execute({
    ...referenceRequest({
      requestId: 'request:scope-widening',
      principalId,
      grantId: grant.grant_id,
      idempotencyKey: 'idempotency:scope-widening-0001'
    }),
    requested_scopes: ['synthetic.read', 'synthetic.admin']
  });
  const destinationWidening = await adapter.execute({
    ...referenceRequest({
      requestId: 'request:destination-widening',
      principalId,
      grantId: grant.grant_id,
      idempotencyKey: 'idempotency:destination-widening-0001'
    }),
    destinations: ['local:reference', 'https://unapproved.example']
  });
  const credentialWidening = await adapter.execute({
    ...referenceRequest({
      requestId: 'request:credential-widening',
      principalId,
      grantId: grant.grant_id,
      idempotencyKey: 'idempotency:credential-widening-0001'
    }),
    credential_handles: ['credential:synthetic-reference', 'credential:admin']
  });

  const futureGrant = signedGrant({
    grantId: 'grant:future',
    principalId,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: now + 10_000
  });
  adapter.registerGrant(futureGrant);
  const future = await adapter.execute(referenceRequest({
    requestId: 'request:future-grant',
    principalId,
    grantId: futureGrant.grant_id,
    idempotencyKey: 'idempotency:future-grant-0001'
  }));

  const expiredGrant = signedGrant({
    grantId: 'grant:expired',
    principalId,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now: now - 120_000,
    lifetimeMs: 60_000
  });
  adapter.registerGrant(expiredGrant);
  const expired = await adapter.execute(referenceRequest({
    requestId: 'request:expired',
    principalId,
    grantId: expiredGrant.grant_id,
    idempotencyKey: 'idempotency:expired-0001'
  }));

  const revokedGrant = signedGrant({
    grantId: 'grant:revoked',
    principalId,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now
  });
  adapter.registerGrant(revokedGrant);
  adapter.revokeGrant(revokedGrant.grant_id);
  const revoked = await adapter.execute(referenceRequest({
    requestId: 'request:revoked',
    principalId,
    grantId: revokedGrant.grant_id,
    idempotencyKey: 'idempotency:revoked-0001'
  }));

  const midflightGrant = signedGrant({
    grantId: 'grant:midflight',
    principalId,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now
  });
  adapter.registerGrant(midflightGrant);
  const midflight = await adapter.execute(referenceRequest({
    requestId: 'request:midflight',
    principalId,
    grantId: midflightGrant.grant_id,
    idempotencyKey: 'idempotency:midflight-0001'
  }), {
    beforeEffect: ({ adapter: current }) => current.revokeGrant(midflightGrant.grant_id)
  });

  const cancellationGrant = signedGrant({
    grantId: 'grant:cancellation',
    principalId,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now
  });
  adapter.registerGrant(cancellationGrant);
  const cancellationRequest = referenceRequest({
    requestId: 'request:cancellation',
    principalId,
    grantId: cancellationGrant.grant_id,
    idempotencyKey: 'idempotency:cancellation-0001'
  });
  const cancelled = await adapter.execute(cancellationRequest, {
    beforeEffect: ({ adapter: current }) => current.cancel(cancellationRequest.request_id)
  });

  const conflict = await adapter.execute({
    ...base,
    request_id: 'request:reference-conflict',
    input_sha256: sha256('different input')
  });

  const sameGrantFallback = await adapter.execute({
    ...referenceRequest({
      requestId: 'request:fallback-same-grant',
      principalId,
      grantId: grant.grant_id,
      idempotencyKey: 'idempotency:fallback-same-grant-0001'
    }),
    fallback_from_grant_id: grant.grant_id
  });
  const fallbackGrant = signedGrant({
    grantId: 'grant:reference-fallback',
    principalId,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now,
    fallbackFromGrantId: grant.grant_id
  });
  adapter.registerGrant(fallbackGrant);
  const freshFallback = await adapter.execute({
    ...referenceRequest({
      requestId: 'request:fallback-fresh-grant',
      principalId,
      grantId: fallbackGrant.grant_id,
      idempotencyKey: 'idempotency:fallback-fresh-grant-0001'
    }),
    fallback_from_grant_id: grant.grant_id
  });

  const uncertainGrant = signedGrant({
    grantId: 'grant:uncertain',
    principalId,
    adapterId: manifest.adapter_id,
    runtimeId: manifest.runtime.runtime_id,
    now
  });
  adapter.registerGrant(uncertainGrant);
  const uncertain = await adapter.execute({
    ...referenceRequest({
      requestId: 'request:uncertain',
      principalId,
      grantId: uncertainGrant.grant_id,
      idempotencyKey: 'idempotency:uncertain-0001'
    }),
    simulation: 'transport-loss-after-dispatch'
  });

  const tamperedReceipt = structuredClone(completed.receipt);
  tamperedReceipt.execution.state = 'failed';
  const malformed = {
    ...referenceRequest({
      requestId: 'request:malformed',
      principalId,
      grantId: grant.grant_id,
      idempotencyKey: 'idempotency:malformed-0001'
    }),
    ambient_host_access: true
  };

  const checks = {
    contract_digest_pinned:
      verifyRuntimeAdapterContract().contract_sha256
        === RUNTIME_ADAPTER_CONTRACT_SHA256,
    manifest_is_fail_closed:
      validateSyntheticReferenceAdapterManifest(manifest) === true,
    installation_grants_no_authority:
      install.authority_granted === false
      && install.external_runtime_loaded === false
      && install.external_effects_enabled === false,
    unsigned_grant_rejected: unsignedGrantRejected,
    grant_replay_rejected: grantReplayRejected,
    grant_single_use_enforced:
      reusedGrant.state === 'denied' && reusedGrant.code === 'grant-consumed',
    valid_synthetic_request_completed: completed.state === 'completed',
    no_external_effect_claimed:
      completed.receipt.external_effect_performed === false,
    missing_grant_denied:
      missingGrant.state === 'denied' && missingGrant.code === 'grant-required',
    unknown_operation_denied:
      unknownOperation.state === 'denied'
      && unknownOperation.code === 'unmapped-operation',
    action_mismatch_denied:
      actionMismatch.state === 'denied' && actionMismatch.code === 'action-mismatch',
    scope_widening_denied:
      scopeWidening.state === 'denied' && scopeWidening.code === 'scope-not-mapped',
    destination_widening_denied:
      destinationWidening.state === 'denied'
      && destinationWidening.code === 'destination-not-mapped',
    credential_widening_denied:
      credentialWidening.state === 'denied'
      && credentialWidening.code === 'credential-handle-not-mapped',
    future_grant_denied:
      future.state === 'denied' && future.code === 'grant-not-yet-valid',
    expired_grant_denied:
      expired.state === 'denied' && expired.code === 'grant-expired',
    revoked_grant_denied:
      revoked.state === 'revoked' && revoked.code === 'grant-revoked',
    midflight_revocation_preempted:
      midflight.state === 'revoked' && midflight.code === 'grant-revoked',
    cancellation_preempted:
      cancelled.state === 'cancelled' && cancelled.code === 'cancelled-before-effect',
    idempotent_replay_stable:
      replay.replayed === true
      && digestObject(replay.receipt) === digestObject(completed.receipt),
    idempotency_conflict_denied:
      conflict.state === 'denied' && conflict.code === 'idempotency-conflict',
    same_grant_fallback_denied:
      sameGrantFallback.state === 'denied'
      && sameGrantFallback.code === 'fresh-fallback-grant-required',
    fresh_fallback_grant_accepted:
      freshFallback.state === 'completed'
      && freshFallback.receipt.execution.fallback_used === true,
    transport_loss_marked_uncertain:
      uncertain.state === 'uncertain'
      && uncertain.code === 'transport-lost-after-dispatch',
    malformed_request_rejected: await rejectsAsync(() => adapter.execute(malformed)),
    receipt_tampering_rejected:
      rejects(() => verifySyntheticReferenceReceipt(tamperedReceipt)),
    receipt_excludes_secret_material:
      !canonicalJson(completed.receipt).includes(rawSecret)
      && !canonicalJson(completed.receipt).includes('credential:synthetic-reference'),
    production_conformance_not_claimed:
      completed.receipt.production_conformance_claimed === false
  };
  if (
    canonicalJson(Object.keys(checks)) !== canonicalJson(CHECK_NAMES)
    || Object.values(checks).some(value => value !== true)
  ) throw new ValidationError('Runtime adapter reference conformance checks failed');

  const signer = identity('runtime-adapter-reference-conformance');
  const unsigned = {
    schema: REFERENCE_EVIDENCE_SCHEMA,
    contract: structuredClone(manifest.contract),
    status: 'passed',
    generated_at: new Date(now).toISOString(),
    scope: 'synthetic-runtime-adapter-reference-conformance-only',
    synthetic_fixture: true,
    external_runtime_loaded: false,
    external_effects_performed: false,
    production_conformance_claimed: false,
    source: {
      kernel_version: KERNEL_VERSION,
      revision: REVISION.test(sourceRevision ?? '') ? sourceRevision : null,
      commit_bound: REVISION.test(sourceRevision ?? '')
    },
    manifest_digest: digestObject(manifest),
    checks,
    results: {
      check_count: CHECK_NAMES.length,
      completed_receipt_digest: digestObject(completed.receipt),
      fallback_receipt_digest: digestObject(freshFallback.receipt),
      uncertain_receipt_digest: digestObject(uncertain.receipt)
    },
    signer: {
      key_id: signer.keyId,
      public_key_pem: publicPem(signer)
    }
  };
  const evidence = {
    ...unsigned,
    attestation: signer.signObject(unsigned)
  };
  verifyRuntimeAdapterReferenceConformanceEvidence(evidence);
  return evidence;
}

export function verifyRuntimeAdapterReferenceConformanceEvidence(evidence) {
  exactKeys(evidence, 'Runtime adapter reference conformance evidence', [
    'schema',
    'contract',
    'status',
    'generated_at',
    'scope',
    'synthetic_fixture',
    'external_runtime_loaded',
    'external_effects_performed',
    'production_conformance_claimed',
    'source',
    'manifest_digest',
    'checks',
    'results',
    'signer',
    'attestation'
  ]);
  exactKeys(evidence.contract, 'Runtime adapter reference conformance contract', [
    'contract_id',
    'contract_version',
    'contract_sha256'
  ]);
  if (
    evidence.schema !== REFERENCE_EVIDENCE_SCHEMA
    || evidence.contract.contract_id !== RUNTIME_ADAPTER_CONTRACT_ID
    || evidence.contract.contract_version !== RUNTIME_ADAPTER_CONTRACT_VERSION
    || evidence.contract.contract_sha256 !== RUNTIME_ADAPTER_CONTRACT_SHA256
    || evidence.status !== 'passed'
    || !canonicalTimestamp(evidence.generated_at)
    || evidence.scope !== 'synthetic-runtime-adapter-reference-conformance-only'
    || evidence.synthetic_fixture !== true
    || evidence.external_runtime_loaded !== false
    || evidence.external_effects_performed !== false
    || evidence.production_conformance_claimed !== false
    || !DIGEST.test(evidence.manifest_digest ?? '')
  ) throw new ValidationError('Runtime adapter reference conformance evidence is invalid');
  exactKeys(evidence.source, 'Runtime adapter reference conformance source', [
    'kernel_version',
    'revision',
    'commit_bound'
  ]);
  if (
    evidence.source.kernel_version !== KERNEL_VERSION
    || (
      evidence.source.commit_bound === true
        ? !REVISION.test(evidence.source.revision ?? '')
        : evidence.source.commit_bound !== false || evidence.source.revision !== null
    )
  ) throw new ValidationError('Runtime adapter reference conformance source is invalid');
  exactKeys(evidence.checks, 'Runtime adapter reference conformance checks', CHECK_NAMES);
  if (Object.values(evidence.checks).some(value => value !== true)) {
    throw new ValidationError('Runtime adapter reference conformance checks are incomplete');
  }
  exactKeys(evidence.results, 'Runtime adapter reference conformance results', [
    'check_count',
    'completed_receipt_digest',
    'fallback_receipt_digest',
    'uncertain_receipt_digest'
  ]);
  exactKeys(evidence.signer, 'Runtime adapter reference conformance signer', [
    'key_id',
    'public_key_pem'
  ]);
  exactKeys(evidence.attestation, 'Runtime adapter reference conformance attestation', [
    'algorithm',
    'key_id',
    'digest',
    'signature'
  ]);
  if (
    evidence.results.check_count !== CHECK_NAMES.length
    || !DIGEST.test(evidence.results.completed_receipt_digest ?? '')
    || !DIGEST.test(evidence.results.fallback_receipt_digest ?? '')
    || !DIGEST.test(evidence.results.uncertain_receipt_digest ?? '')
  ) throw new ValidationError('Runtime adapter reference conformance results are invalid');
  const key = parsePublicKey(evidence.signer?.public_key_pem);
  if (
    evidence.signer?.key_id !== evidence.attestation?.key_id
    || !evidence.signer.key_id.endsWith(
      `:${sha256(evidence.signer.public_key_pem).slice(0, 16)}`
    )
  ) throw new ValidationError('Runtime adapter reference conformance signer is invalid');
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, key)) {
    throw new ValidationError('Runtime adapter reference conformance signature is invalid');
  }
  return {
    valid: true,
    schema: evidence.schema,
    external_runtime_loaded: false,
    external_effects_performed: false,
    production_conformance_claimed: false,
    check_count: evidence.results.check_count
  };
}

function referenceGrant({
  grantId,
  principalId,
  adapterId,
  runtimeId,
  now,
  lifetimeMs = 60_000,
  fallbackFromGrantId = null,
  signer,
  scopes = ['synthetic.read'],
  destinations = ['local:reference'],
  credentialHandles = ['credential:synthetic-reference']
}) {
  if (!signer || typeof signer.signObject !== 'function') {
    throw new ValidationError('Synthetic grant signer is required');
  }
  const unsigned = {
    schema: 'axiom-runtime-adapter-grant.v1',
    grant_id: grantId,
    principal_id: principalId,
    adapter_id: adapterId,
    runtime_id: runtimeId,
    axiom_action: 'adapter.reference.echo',
    scopes,
    destinations,
    credential_handles: credentialHandles,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + lifetimeMs).toISOString(),
    status: 'active',
    fallback_from_grant_id: fallbackFromGrantId
  };
  return {
    ...unsigned,
    attestation: signer.signObject(unsigned)
  };
}

function referenceRequest({
  requestId,
  principalId,
  grantId,
  idempotencyKey,
  inputSha256 = sha256('synthetic reference input')
}) {
  return {
    schema: 'axiom-runtime-adapter-request.v1',
    request_id: requestId,
    principal_id: principalId,
    runtime_operation: 'reference.echo',
    axiom_action: 'adapter.reference.echo',
    input_sha256: inputSha256,
    requested_scopes: ['synthetic.read'],
    destinations: ['local:reference'],
    credential_handles: ['credential:synthetic-reference'],
    idempotency_key: idempotencyKey,
    grant_id: grantId,
    fallback_from_grant_id: null,
    simulation: 'complete'
  };
}

function validateRequest(request) {
  exactKeys(request, 'Runtime adapter request', REQUEST_FIELDS);
  if (
    request.schema !== 'axiom-runtime-adapter-request.v1'
    || !DIGEST.test(request.input_sha256 ?? '')
    || !['complete', 'provider-failed-before-effect', 'transport-loss-after-dispatch']
      .includes(request.simulation)
  ) throw new ValidationError('Runtime adapter request is invalid');
  for (const [name, value] of [
    ['request_id', request.request_id],
    ['principal_id', request.principal_id],
    ['runtime_operation', request.runtime_operation],
    ['axiom_action', request.axiom_action],
    ['idempotency_key', request.idempotency_key],
    ['grant_id', request.grant_id]
  ]) assertId(value, name);
  if (request.fallback_from_grant_id !== null) {
    assertId(request.fallback_from_grant_id, 'fallback_from_grant_id');
  }
  stringList(request.requested_scopes, 'requested_scopes');
  stringList(request.destinations, 'destinations');
  stringList(request.credential_handles, 'credential_handles');
}

function validateGrant(grant) {
  exactKeys(grant, 'Runtime adapter grant', GRANT_FIELDS);
  exactKeys(grant.attestation, 'Runtime adapter grant attestation', [
    'algorithm',
    'key_id',
    'digest',
    'signature'
  ]);
  if (
    grant.schema !== 'axiom-runtime-adapter-grant.v1'
    || !canonicalTimestamp(grant.issued_at)
    || !canonicalTimestamp(grant.expires_at)
    || Date.parse(grant.expires_at) <= Date.parse(grant.issued_at)
    || !['active', 'revoked'].includes(grant.status)
    || grant.attestation.algorithm !== 'Ed25519'
    || typeof grant.attestation.key_id !== 'string'
    || !DIGEST.test(grant.attestation.digest ?? '')
    || !/^[A-Za-z0-9_-]{80,128}$/.test(grant.attestation.signature ?? '')
  ) throw new ValidationError('Runtime adapter grant is invalid');
  for (const [name, value] of [
    ['grant_id', grant.grant_id],
    ['principal_id', grant.principal_id],
    ['adapter_id', grant.adapter_id],
    ['runtime_id', grant.runtime_id],
    ['axiom_action', grant.axiom_action]
  ]) assertId(value, name);
  if (grant.fallback_from_grant_id !== null) {
    assertId(grant.fallback_from_grant_id, 'fallback_from_grant_id');
  }
  stringList(grant.scopes, 'scopes');
  stringList(grant.destinations, 'destinations');
  stringList(grant.credential_handles, 'credential_handles');
}

function denied(code, mapping) {
  return { ok: false, state: 'denied', code, mapping };
}

function subset(requested, allowed) {
  const allowedSet = new Set(allowed);
  return requested.every(value => allowedSet.has(value));
}

function assertId(value, name) {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new ValidationError(`${name} is invalid`);
  }
}

function stringList(value, name) {
  if (
    !Array.isArray(value)
    || value.length > 128
    || new Set(value).size !== value.length
    || value.some(item => typeof item !== 'string' || item.length < 1 || item.length > 1024)
  ) throw new ValidationError(`${name} is invalid`);
}

function exactKeys(value, name, keys) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${name} fields are invalid`);
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function publicPem(identityValue) {
  return identityValue.publicKey.export({ type: 'spki', format: 'pem' });
}

function parsePublicKey(pem) {
  if (
    typeof pem !== 'string'
    || !pem.includes('-----BEGIN PUBLIC KEY-----')
    || pem.includes('PRIVATE KEY')
  ) throw new ValidationError('Runtime adapter conformance public key is invalid');
  try {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
    return key;
  } catch {
    throw new ValidationError('Runtime adapter conformance public key is invalid');
  }
}

function rejects(callback) {
  try {
    callback();
    return false;
  } catch (error) {
    return error instanceof ValidationError;
  }
}

async function rejectsAsync(callback) {
  try {
    await callback();
    return false;
  } catch (error) {
    return error instanceof ValidationError;
  }
}

export {
  referenceGrant as createSyntheticReferenceGrant,
  referenceRequest as createSyntheticReferenceRequest
};

async function main() {
  const option = process.argv[2];
  if (process.argv.length > 3 || (option && option !== '--require-commit-bound')) {
    throw new ValidationError(
      'Usage: node src/runtime-adapter-conformance.mjs [--require-commit-bound]'
    );
  }
  process.stdout.write(`${JSON.stringify(
    await runRuntimeAdapterReferenceConformance({
      requireCommitBound: option === '--require-commit-bound'
    }),
    null,
    2
  )}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
