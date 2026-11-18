/**
 * Hermes RUNTIME-002 identity-only fixture adapter (research slice).
 *
 * Fixture-backed driver for code-identity inspection against the provisional
 * Hermes pin. Does not spawn Hermes, load .env, open network, run inference,
 * or accept hermes dump. Not production certification.
 */

import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  ValidationError,
  assertPlainObject,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import { MeshIdentity, verifyObjectSignature } from './identity.mjs';
import {
  RUNTIME_ADAPTER_CONTRACT_ID,
  RUNTIME_ADAPTER_CONTRACT_SCHEMA,
  RUNTIME_ADAPTER_CONTRACT_SHA256,
  RUNTIME_ADAPTER_CONTRACT_VERSION,
  verifyRuntimeAdapterContract
} from './runtime-adapter-contract.mjs';

export const HERMES_IDENTITY_PIN_SCHEMA = 'axiom-hermes-runtime-002-identity-pin.v0';
export const HERMES_IDENTITY_RECEIPT_SCHEMA =
  'axiom-hermes-identity-fixture-receipt.v0';
export const HERMES_PIN_COMMIT =
  'b6bcb3e791c673e63974029bbab40cc9326803ff';
export const HERMES_PIN_SHORT_SHA = 'b6bcb3e7';
export const HERMES_PIN_VERSION = '0.20.5';
export const HERMES_UPSTREAM =
  'https://github.com/NousResearch/hermes-agent';
export const HERMES_RUNTIME_OPERATION = 'hermes.get_code_identity';
export const HERMES_AXIOM_ACTION = 'adapter.hermes.code_identity.inspect';
export const ALLOWED_IDENTITY_FIELDS = Object.freeze([
  'sha',
  'short_sha',
  'version',
  'source'
]);
export const ALLOWED_IDENTITY_SOURCES = Object.freeze(['git', 'build-file']);
export const REJECTED_OPERATIONS = Object.freeze([
  'hermes.dump',
  'hermes dump'
]);

const PIN_URL = new URL(
  '../../fixtures/runtime-adapter/hermes-runtime-002-identity-pin.json',
  import.meta.url
);

const DIGEST = /^[a-f0-9]{64}$/;
const FULL_SHA = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

const PIN_TOP_FIELDS = Object.freeze([
  'schema',
  'status',
  'production_certification_claimed',
  'pin_accepted',
  'live_hermes_spawned',
  'upstream',
  'first_operation',
  'execution_profile',
  'expected_identity',
  'normative_refs'
]);

function exactKeys(value, name, keys) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) {
    throw new ValidationError(`${name} fields are invalid`);
  }
}

function assertId(value, name) {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new ValidationError(`${name} is invalid`);
  }
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
  ) {
    throw new ValidationError('Hermes fixture receipt public key is invalid');
  }
  try {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
    return key;
  } catch {
    throw new ValidationError('Hermes fixture receipt public key is invalid');
  }
}

export function loadHermesIdentityPinProfile({
  source = readFileSync(PIN_URL, 'utf8')
} = {}) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new ValidationError('Hermes identity pin fixture is not valid JSON');
  }
  return validateHermesIdentityPinProfile(parsed);
}

export function validateHermesIdentityPinProfile(profile) {
  const value = assertPlainObject(profile, 'Hermes identity pin profile');
  exactKeys(value, 'Hermes identity pin profile', PIN_TOP_FIELDS);
  exactKeys(value.upstream, 'Hermes identity pin upstream', [
    'repository',
    'immutable_commit',
    'short_sha',
    'project_version',
    'license_spdx',
    'commit_signature_verified'
  ]);
  exactKeys(value.first_operation, 'Hermes identity pin first_operation', [
    'runtime_operation',
    'axiom_action',
    'effect_class',
    'helper',
    'allowed_fields',
    'allowed_sources',
    'rejected_operations'
  ]);
  exactKeys(value.execution_profile, 'Hermes identity pin execution_profile', [
    'network',
    'env_import',
    'credentials_permitted',
    'lazy_installs',
    'browser',
    'messaging',
    'mcp',
    'a2a',
    'terminal',
    'cron',
    'skill_update',
    'self_update',
    'model_inference',
    'remote_execution',
    'fail_closed_on_unknown_identity',
    'fail_closed_on_sha_mismatch',
    'subprocess_spawn',
    'driver',
    'not_production_certification'
  ]);
  exactKeys(value.expected_identity, 'Hermes identity pin expected_identity', [
    'sha',
    'short_sha',
    'version',
    'source'
  ]);

  if (
    value.schema !== HERMES_IDENTITY_PIN_SCHEMA
    || value.status !== 'provisional-research-fixture'
    || value.production_certification_claimed !== false
    || value.pin_accepted !== false
    || value.live_hermes_spawned !== false
    || value.upstream.repository !== HERMES_UPSTREAM
    || value.upstream.immutable_commit !== HERMES_PIN_COMMIT
    || value.upstream.short_sha !== HERMES_PIN_SHORT_SHA
    || value.upstream.project_version !== HERMES_PIN_VERSION
    || value.upstream.license_spdx !== 'MIT'
    || value.upstream.commit_signature_verified !== false
    || value.first_operation.runtime_operation !== HERMES_RUNTIME_OPERATION
    || value.first_operation.axiom_action !== HERMES_AXIOM_ACTION
    || value.first_operation.effect_class !== 'read'
    || value.first_operation.helper !== 'hermes_cli.build_info.get_code_identity'
    || canonicalJson(value.first_operation.allowed_fields)
      !== canonicalJson([...ALLOWED_IDENTITY_FIELDS])
    || canonicalJson(value.first_operation.allowed_sources)
      !== canonicalJson([...ALLOWED_IDENTITY_SOURCES])
    || canonicalJson(value.first_operation.rejected_operations)
      !== canonicalJson([...REJECTED_OPERATIONS])
    || value.execution_profile.network !== 'disabled'
    || value.execution_profile.env_import !== false
    || value.execution_profile.credentials_permitted !== false
    || value.execution_profile.lazy_installs !== false
    || value.execution_profile.browser !== false
    || value.execution_profile.messaging !== false
    || value.execution_profile.mcp !== false
    || value.execution_profile.a2a !== false
    || value.execution_profile.terminal !== false
    || value.execution_profile.cron !== false
    || value.execution_profile.skill_update !== false
    || value.execution_profile.self_update !== false
    || value.execution_profile.model_inference !== false
    || value.execution_profile.remote_execution !== false
    || value.execution_profile.fail_closed_on_unknown_identity !== true
    || value.execution_profile.fail_closed_on_sha_mismatch !== true
    || value.execution_profile.subprocess_spawn !== false
    || value.execution_profile.driver !== 'fixture-backed'
    || value.execution_profile.not_production_certification !== true
    || value.expected_identity.sha !== HERMES_PIN_COMMIT
    || value.expected_identity.short_sha !== HERMES_PIN_SHORT_SHA
    || value.expected_identity.version !== HERMES_PIN_VERSION
    || value.expected_identity.source !== 'git'
    || !Array.isArray(value.normative_refs)
    || value.normative_refs.length < 1
  ) {
    throw new ValidationError('Hermes identity pin profile invariants are invalid');
  }

  return Object.freeze(structuredClone(value));
}

/**
 * Fail-closed validation of a Hermes get_code_identity observation.
 * Unknown identity, SHA ≠ pin, forged build-sha, or extra fields deny.
 */
export function validateHermesCodeIdentityObservation(identity, profile = loadHermesIdentityPinProfile()) {
  validateHermesIdentityPinProfile(profile);
  const value = assertPlainObject(identity, 'Hermes code identity observation');
  exactKeys(value, 'Hermes code identity observation', ALLOWED_IDENTITY_FIELDS);

  const { sha, short_sha: shortSha, version, source } = value;

  if (source === 'unknown' || sha === null || sha === undefined || sha === '') {
    throw new ValidationError('Hermes code identity is unknown; fail closed');
  }
  if (!ALLOWED_IDENTITY_SOURCES.includes(source)) {
    throw new ValidationError(`Hermes code identity source is not permitted: ${String(source)}`);
  }
  if (typeof sha !== 'string' || !FULL_SHA.test(sha)) {
    throw new ValidationError('Hermes code identity sha must be a full 40-char commit');
  }
  if (sha !== profile.upstream.immutable_commit) {
    throw new ValidationError(
      `Hermes code identity sha does not match provisional pin ${profile.upstream.immutable_commit}`
    );
  }
  if (typeof shortSha !== 'string' || shortSha !== sha.slice(0, 8)) {
    throw new ValidationError('Hermes code identity short_sha does not match sha prefix');
  }
  if (shortSha !== profile.upstream.short_sha) {
    throw new ValidationError('Hermes code identity short_sha does not match provisional pin');
  }
  if (version !== profile.upstream.project_version) {
    throw new ValidationError(
      `Hermes code identity version does not match pin version ${profile.upstream.project_version}`
    );
  }

  // build-file path is allowed only when the baked SHA still equals the pin
  // (forged .hermes_build_sha already fails the sha !== pin check above).
  return Object.freeze({
    sha,
    short_sha: shortSha,
    version,
    source
  });
}

export function rejectHermesRuntimeOperation(runtimeOperation) {
  const normalized = typeof runtimeOperation === 'string'
    ? runtimeOperation.trim()
    : '';
  if (
    REJECTED_OPERATIONS.includes(normalized)
    || normalized === 'dump'
    || normalized.endsWith('.dump')
  ) {
    throw new ValidationError(
      'hermes dump and broader diagnostics are rejected for the RUNTIME-002 identity-only slice'
    );
  }
  if (normalized !== HERMES_RUNTIME_OPERATION) {
    throw new ValidationError(
      `unsupported Hermes runtime operation for identity fixture: ${normalized || '(empty)'}`
    );
  }
  return HERMES_RUNTIME_OPERATION;
}

export function createHermesIdentityAdapterManifest({
  profile = loadHermesIdentityPinProfile(),
  meshSourceRevision = '0'.repeat(40)
} = {}) {
  validateHermesIdentityPinProfile(profile);
  if (!FULL_SHA.test(meshSourceRevision) && !/^0{40}$/.test(meshSourceRevision)) {
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(meshSourceRevision)) {
      throw new ValidationError('Hermes adapter mesh source revision is invalid');
    }
  }

  verifyRuntimeAdapterContract();

  return Object.freeze({
    schema: RUNTIME_ADAPTER_CONTRACT_SCHEMA,
    contract: Object.freeze({
      contract_id: RUNTIME_ADAPTER_CONTRACT_ID,
      contract_version: RUNTIME_ADAPTER_CONTRACT_VERSION,
      contract_sha256: RUNTIME_ADAPTER_CONTRACT_SHA256
    }),
    adapter_id: 'axiom.hermes.identity-fixture',
    adapter_version: '0.1.0-research.1',
    runtime: Object.freeze({
      runtime_id: 'nousresearch.hermes-agent',
      project_name: 'Hermes Agent',
      source_repository: profile.upstream.repository,
      source_commit: profile.upstream.immutable_commit,
      release_ref: `research-pin@${profile.upstream.project_version}`,
      license_spdx: profile.upstream.license_spdx,
      upstream_supported: true,
      integration_modes: Object.freeze(['sidecar'])
    }),
    implementation: Object.freeze({
      artifact_ref: 'fixture://axiom/hermes-identity-fixture-adapter',
      artifact_sha256: sha256(
        `hermes-identity-fixture-adapter\n${profile.upstream.immutable_commit}`
      ),
      sbom_sha256: sha256(
        `hermes-identity-fixture-sbom-placeholder\n${profile.upstream.immutable_commit}`
      ),
      entrypoint: 'mesh/src/lib/hermes-identity-fixture-adapter.mjs'
    }),
    compatibility: Object.freeze({
      capsule_schema_ids: Object.freeze(['axiom-agent-runtime-capsule.v1']),
      gateway_contracts: Object.freeze([{
        contract_id: 'axiom-gateway-client-contract',
        contract_version: '1.0.0',
        contract_sha256: sha256('hermes-identity-fixture-gateway-contract-placeholder')
      }]),
      source_pin_required: true,
      mutable_ref_allowed: false
    }),
    authority: Object.freeze({
      principal_id: 'runtime:hermes-identity-fixture',
      authority_source: 'axiom-gateway',
      requested_capabilities: Object.freeze(['adapter.hermes.code_identity.inspect']),
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
    }),
    capability_translation: Object.freeze({
      unmapped_behavior: 'deny',
      mappings: Object.freeze([{
        runtime_operation: HERMES_RUNTIME_OPERATION,
        axiom_action: HERMES_AXIOM_ACTION,
        effect_class: 'read',
        input_schema_ref: 'fixture://schemas/hermes-code-identity-input.v0',
        output_schema_ref: 'fixture://schemas/hermes-code-identity-output.v0',
        requested_scopes: Object.freeze(['hermes.identity.read']),
        destinations: Object.freeze(['local:hermes-identity-fixture']),
        credential_handles: Object.freeze([])
      }])
    }),
    data_handling: Object.freeze({
      accepted_data_classes: Object.freeze(['synthetic-public']),
      allowed_egress_destinations: Object.freeze([]),
      secret_transport: 'opaque-handle-only',
      raw_content_telemetry: false,
      cross_scope_memory: false,
      retention: Object.freeze({ mode: 'ephemeral', maximum_seconds: 0 }),
      deletion: Object.freeze({
        supported: true,
        maximum_completion_ms: 1000,
        receipt_required: true
      })
    }),
    execution: Object.freeze({
      sandbox_required: true,
      direct_host_tool_access: false,
      direct_credential_access: false,
      request_timeout_ms: 1000,
      maximum_request_bytes: 4096,
      maximum_response_bytes: 4096,
      maximum_concurrency: 1,
      cancellation: Object.freeze({
        supported: true,
        acknowledgement_deadline_ms: 100
      }),
      retry: Object.freeze({
        maximum_attempts: 1,
        backoff_ms: 0,
        side_effect_retry_requires_idempotency_key: true
      }),
      failure_mode: 'deny',
      unknown_outcome: 'uncertain',
      fallback_requires_new_grant: true
    }),
    evidence: Object.freeze({
      receipt_schema_ref: HERMES_IDENTITY_RECEIPT_SCHEMA,
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
      outcome_states: Object.freeze([
        'completed',
        'denied',
        'failed',
        'timed-out',
        'cancelled',
        'revoked',
        'uncertain'
      ])
    }),
    lifecycle: Object.freeze({
      revocation_supported: true,
      state_export_supported: true,
      rollback_supported: true,
      uninstall_supported: true,
      cleanup_targets: Object.freeze([
        'credential-handles',
        'network-sessions',
        'cached-data',
        'background-workers',
        'pending-effects'
      ]),
      orphaned_effect_behavior: 'reconcile-before-retry'
    }),
    research_non_claims: Object.freeze({
      fixture_backed: true,
      live_hermes_spawned: false,
      production_conformance_claimed: false,
      pin_accepted: false,
      mesh_source_revision: meshSourceRevision
    })
  });
}

export function createHermesIdentityFixtureAuthorities() {
  const grantSigner = identity('hermes-identity-fixture-gateway');
  const receiptSigner = identity('hermes-identity-fixture-receipt');
  return Object.freeze({
    grant: Object.freeze({
      signer: grantSigner,
      verifier: Object.freeze({
        key_id: grantSigner.keyId,
        public_key_pem: publicPem(grantSigner)
      })
    }),
    receipt: Object.freeze({
      signer: receiptSigner,
      verifier: Object.freeze({
        key_id: receiptSigner.keyId,
        public_key_pem: publicPem(receiptSigner)
      })
    })
  });
}

export function createHermesIdentityFixtureGrant({
  grantId,
  principalId,
  adapterId,
  runtimeId,
  now,
  lifetimeMs = 60_000,
  signer,
  inputSha256 = sha256('hermes-identity-fixture-input')
}) {
  if (!signer || typeof signer.signObject !== 'function') {
    throw new ValidationError('Hermes fixture grant signer is required');
  }
  assertId(grantId, 'grant_id');
  assertId(principalId, 'principal_id');
  assertId(adapterId, 'adapter_id');
  assertId(runtimeId, 'runtime_id');
  const unsigned = {
    schema: 'axiom-runtime-adapter-grant.v1',
    grant_id: grantId,
    principal_id: principalId,
    adapter_id: adapterId,
    runtime_id: runtimeId,
    axiom_action: HERMES_AXIOM_ACTION,
    input_sha256: inputSha256,
    scopes: ['hermes.identity.read'],
    destinations: ['local:hermes-identity-fixture'],
    credential_handles: [],
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + lifetimeMs).toISOString(),
    status: 'active',
    fallback_from_grant_id: null
  };
  return {
    ...unsigned,
    attestation: signer.signObject(unsigned)
  };
}

export function createHermesIdentityFixtureRequest({
  requestId,
  principalId,
  grantId,
  idempotencyKey,
  inputSha256 = sha256('hermes-identity-fixture-input')
}) {
  return {
    schema: 'axiom-runtime-adapter-request.v1',
    request_id: requestId,
    principal_id: principalId,
    runtime_operation: HERMES_RUNTIME_OPERATION,
    axiom_action: HERMES_AXIOM_ACTION,
    input_sha256: inputSha256,
    requested_scopes: ['hermes.identity.read'],
    destinations: ['local:hermes-identity-fixture'],
    credential_handles: [],
    idempotency_key: idempotencyKey,
    grant_id: grantId,
    fallback_from_grant_id: null,
    simulation: 'complete'
  };
}

/**
 * Fixture-backed identity inspection path. Never spawns Hermes.
 * Binds contract + manifest digests into a signed research receipt.
 */
export class HermesIdentityFixtureAdapter {
  constructor({
    profile = loadHermesIdentityPinProfile(),
    manifest = createHermesIdentityAdapterManifest({ profile }),
    now = () => Date.now(),
    receiptSigner,
    grantAuthority
  } = {}) {
    this.profile = validateHermesIdentityPinProfile(profile);
    this.manifest = structuredClone(manifest);
    if (
      this.manifest.contract.contract_sha256 !== RUNTIME_ADAPTER_CONTRACT_SHA256
      || this.manifest.runtime.source_commit !== this.profile.upstream.immutable_commit
    ) {
      throw new ValidationError('Hermes fixture adapter manifest is not bound to the provisional pin');
    }
    exactKeys(grantAuthority, 'Hermes fixture grant authority', [
      'key_id',
      'public_key_pem'
    ]);
    this.grantVerificationKey = parsePublicKey(grantAuthority.public_key_pem);
    if (
      typeof grantAuthority.key_id !== 'string'
      || !grantAuthority.key_id.endsWith(
        `:${sha256(grantAuthority.public_key_pem).slice(0, 16)}`
      )
    ) {
      throw new ValidationError('Hermes fixture grant authority is invalid');
    }
    this.grantSignerKeyId = grantAuthority.key_id;
    this.receiptSigner = receiptSigner ?? identity('hermes-identity-fixture-receipt');
    this.receiptAuthority = Object.freeze({
      key_id: this.receiptSigner.keyId,
      public_key_pem: publicPem(this.receiptSigner)
    });
    this.now = now;
    this.grants = new Map();
    this.consumedGrants = new Map();
  }

  install() {
    return Object.freeze({
      installed: true,
      authority_granted: false,
      external_runtime_loaded: false,
      live_hermes_spawned: false,
      production_conformance_claimed: false,
      pin_accepted: false,
      driver: 'fixture-backed'
    });
  }

  registerGrant(grant) {
    assertPlainObject(grant, 'Hermes fixture grant');
    assertPlainObject(grant.attestation, 'Hermes fixture grant attestation');
    const unsigned = structuredClone(grant);
    delete unsigned.attestation;
    if (
      grant.attestation.key_id !== this.grantSignerKeyId
      || !verifyObjectSignature(unsigned, grant.attestation, this.grantVerificationKey)
    ) {
      throw new ValidationError('Hermes fixture grant signature is invalid');
    }
    if (
      grant.adapter_id !== this.manifest.adapter_id
      || grant.runtime_id !== this.manifest.runtime.runtime_id
      || grant.axiom_action !== HERMES_AXIOM_ACTION
    ) {
      throw new ValidationError('Hermes fixture grant is not bound to the identity adapter');
    }
    if (this.grants.has(grant.grant_id)) {
      throw new ValidationError('Hermes fixture grant replay is not allowed');
    }
    this.grants.set(grant.grant_id, structuredClone(grant));
    return true;
  }

  /**
   * @param {object} request adapter request
   * @param {{ identityFixture?: object }} options fixture observation only
   */
  async execute(request, { identityFixture } = {}) {
    rejectHermesRuntimeOperation(request.runtime_operation);
    if (request.axiom_action !== HERMES_AXIOM_ACTION) {
      return this.#finish(request, {
        state: 'denied',
        code: 'action-mismatch',
        identity: null
      });
    }
    if (!this.grants.has(request.grant_id)) {
      return this.#finish(request, {
        state: 'denied',
        code: 'grant-required',
        identity: null
      });
    }
    const grant = this.grants.get(request.grant_id);
    if (this.consumedGrants.has(grant.grant_id)) {
      return this.#finish(request, {
        state: 'denied',
        code: 'grant-consumed',
        identity: null
      });
    }
    if (grant.input_sha256 !== request.input_sha256) {
      return this.#finish(request, {
        state: 'denied',
        code: 'input-mismatch',
        identity: null
      });
    }

    // Single-use: consume once a valid grant is selected for execution, before
    // identity inspection, so denied identity/field-bounding attempts cannot retry.
    this.consumedGrants.set(grant.grant_id, request.request_id);

    let identityObservation;
    try {
      identityObservation = validateHermesCodeIdentityObservation(
        identityFixture,
        this.profile
      );
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      return this.#finish(request, {
        state: 'denied',
        code: mapIdentityDenialCode(error.message),
        identity: null,
        denial_detail: error.message
      });
    }

    return this.#finish(request, {
      state: 'completed',
      code: 'hermes-identity-fixture-completed',
      identity: identityObservation
    });
  }

  #finish(request, { state, code, identity, denial_detail = null }) {
    const generatedAt = new Date(this.now()).toISOString();
    const registeredGrant = this.grants.get(request.grant_id);
    const contract = verifyRuntimeAdapterContract();
    const unsigned = {
      schema: HERMES_IDENTITY_RECEIPT_SCHEMA,
      contract: {
        contract_id: contract.contract_id,
        contract_version: contract.contract_version,
        contract_sha256: contract.contract_sha256
      },
      manifest_digest: digestObject(this.manifest),
      pin_digest: digestObject(this.profile),
      generated_at: generatedAt,
      research_fixture: true,
      fixture_backed: true,
      external_runtime_loaded: false,
      live_hermes_spawned: false,
      external_effect_performed: false,
      production_conformance_claimed: false,
      pin_accepted: false,
      runtime: {
        runtime_id: this.manifest.runtime.runtime_id,
        source_commit: this.manifest.runtime.source_commit,
        upstream_repository: this.manifest.runtime.source_repository
      },
      adapter: {
        adapter_id: this.manifest.adapter_id,
        adapter_version: this.manifest.adapter_version,
        artifact_sha256: this.manifest.implementation.artifact_sha256
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
        attestation_digest: registeredGrant
          ? digestObject(registeredGrant.attestation)
          : null
      },
      identity: identity
        ? {
          sha: identity.sha,
          short_sha: identity.short_sha,
          version: identity.version,
          source: identity.source,
          identity_digest: digestObject(identity)
        }
        : null,
      execution: {
        state,
        code,
        denial_detail,
        provider: 'hermes-identity-fixture',
        model: 'none',
        cost_minor: 0,
        currency: 'USD',
        latency_ms: 0,
        fallback_used: false
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
    verifyHermesIdentityFixtureReceipt(
      receipt,
      this.receiptAuthority,
      this.manifest,
      this.profile
    );
    return {
      state,
      code,
      replayed: false,
      receipt
    };
  }
}

function mapIdentityDenialCode(message) {
  if (/unknown/i.test(message)) return 'identity-unknown';
  if (/does not match provisional pin/i.test(message)) return 'identity-pin-mismatch';
  if (/forged|build/i.test(message)) return 'identity-forged-build-sha';
  if (/fields are invalid|extra/i.test(message)) return 'identity-field-bounding';
  if (/short_sha/i.test(message)) return 'identity-short-sha-mismatch';
  if (/version/i.test(message)) return 'identity-version-mismatch';
  if (/source is not permitted/i.test(message)) return 'identity-source-denied';
  return 'identity-denied';
}

export function verifyHermesIdentityFixtureReceipt(
  receipt,
  expectedReceiptAuthority,
  expectedManifest,
  expectedProfile = null
) {
  exactKeys(receipt, 'Hermes identity fixture receipt', [
    'schema',
    'contract',
    'manifest_digest',
    'pin_digest',
    'generated_at',
    'research_fixture',
    'fixture_backed',
    'external_runtime_loaded',
    'live_hermes_spawned',
    'external_effect_performed',
    'production_conformance_claimed',
    'pin_accepted',
    'runtime',
    'adapter',
    'request',
    'grant',
    'identity',
    'execution',
    'signer',
    'attestation'
  ]);
  if (
    receipt.schema !== HERMES_IDENTITY_RECEIPT_SCHEMA
    || receipt.research_fixture !== true
    || receipt.fixture_backed !== true
    || receipt.external_runtime_loaded !== false
    || receipt.live_hermes_spawned !== false
    || receipt.external_effect_performed !== false
    || receipt.production_conformance_claimed !== false
    || receipt.pin_accepted !== false
    || receipt.contract.contract_sha256 !== RUNTIME_ADAPTER_CONTRACT_SHA256
    || receipt.contract.contract_id !== RUNTIME_ADAPTER_CONTRACT_ID
    || receipt.contract.contract_version !== RUNTIME_ADAPTER_CONTRACT_VERSION
    || receipt.runtime.source_commit !== HERMES_PIN_COMMIT
    || !DIGEST.test(receipt.manifest_digest ?? '')
    || !DIGEST.test(receipt.pin_digest ?? '')
    || (expectedManifest && receipt.manifest_digest !== digestObject(expectedManifest))
    || (expectedProfile && receipt.pin_digest !== digestObject(expectedProfile))
    || receipt.signer.key_id !== expectedReceiptAuthority.key_id
    || receipt.signer.public_key_pem !== expectedReceiptAuthority.public_key_pem
  ) {
    throw new ValidationError('Hermes identity fixture receipt invariants are invalid');
  }

  const unsigned = structuredClone(receipt);
  delete unsigned.attestation;
  const key = parsePublicKey(expectedReceiptAuthority.public_key_pem);
  if (!verifyObjectSignature(unsigned, receipt.attestation, key)) {
    throw new ValidationError('Hermes identity fixture receipt signature is invalid');
  }
  return true;
}

export function pinnedHermesIdentityFixture() {
  return Object.freeze({
    sha: HERMES_PIN_COMMIT,
    short_sha: HERMES_PIN_SHORT_SHA,
    version: HERMES_PIN_VERSION,
    source: 'git'
  });
}

async function main() {
  if (process.argv.length !== 2) {
    throw new ValidationError(
      'Usage: node src/lib/hermes-identity-fixture-adapter.mjs'
    );
  }
  const profile = loadHermesIdentityPinProfile();
  const manifest = createHermesIdentityAdapterManifest({ profile });
  process.stdout.write(`${JSON.stringify({
    valid: true,
    schema: HERMES_IDENTITY_PIN_SCHEMA,
    pin_commit: profile.upstream.immutable_commit,
    pin_accepted: false,
    production_certification_claimed: false,
    fixture_backed: true,
    live_hermes_spawned: false,
    contract_sha256: RUNTIME_ADAPTER_CONTRACT_SHA256,
    manifest_digest: digestObject(manifest),
    pin_digest: digestObject(profile),
    first_operation: profile.first_operation.runtime_operation,
    rejected_operations: profile.first_operation.rejected_operations
  }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}