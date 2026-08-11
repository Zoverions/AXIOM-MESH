import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import {
  authorizeRepositoryAdapterOperation,
  normalizeRepositoryAdapterDescriptor,
  normalizeRepositoryAdapterOperation,
  repositoryAdapterSupports
} from './repository-adapter.mjs';
import { normalizeSourceState } from './source-continuity.mjs';

export const SOURCE_MIRROR_PLAN_SCHEMA = 'axiom-source-mirror-plan.v1';
export const SOURCE_MIRROR_REF_NAMESPACE = 'refs/axiom/accepted';

const DIGEST = /^[a-f0-9]{64}$/;
const PLAN_ID = /^source-mirror-plan:[a-f0-9]{64}$/;
const MAX_LIFETIME_MS = 15 * 60 * 1000;

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function iso(value, name) {
  const raw = assertString(value, name, { min: 1, max: 64 });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function boundedLifetime(issuedAt, expiresAt, now) {
  const issued = new Date(issuedAt).valueOf();
  const expires = new Date(expiresAt).valueOf();
  const current = new Date(now).valueOf();
  if (expires <= issued || expires - issued > MAX_LIFETIME_MS) {
    throw new ValidationError('source mirror plan lifetime must be positive and at most 15 minutes');
  }
  if (expires <= current) throw new ValidationError('source mirror plan is expired');
}

export function sourceMirrorAcceptedRef(sourceStateDigest) {
  return `${SOURCE_MIRROR_REF_NAMESPACE}/${digest(sourceStateDigest, 'source_state_digest')}`;
}

function normalizePlanBody(raw, {
  now = new Date().toISOString(),
  enforceFreshness = true
} = {}) {
  const value = assertPlainObject(raw, 'source mirror plan');
  const allowed = new Set([
    'schema',
    'repository_id',
    'source_state',
    'source_adapter',
    'target_adapter',
    'source_operation',
    'target_operation',
    'target_ref',
    'expected_commit_oid',
    'retention_mode',
    'delete_allowed',
    'force_update_allowed',
    'provider_api_required',
    'network_required',
    'execution_authorized',
    'planned_at',
    'expires_at'
  ]);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`source mirror plan contains unsupported fields: ${unknown.join(', ')}`);
  }
  if (value.schema !== SOURCE_MIRROR_PLAN_SCHEMA) {
    throw new ValidationError(`source mirror plan schema must be ${SOURCE_MIRROR_PLAN_SCHEMA}`);
  }
  const state = normalizeSourceState(value.source_state);
  const sourceAdapter = normalizeRepositoryAdapterDescriptor(value.source_adapter);
  const targetAdapter = normalizeRepositoryAdapterDescriptor(value.target_adapter);
  const sourceOperation = normalizeRepositoryAdapterOperation(value.source_operation);
  const targetOperation = normalizeRepositoryAdapterOperation(value.target_operation);
  if (
    value.repository_id !== state.repository_id
    || sourceAdapter.repository_id !== state.repository_id
    || targetAdapter.repository_id !== state.repository_id
  ) {
    throw new ValidationError('source mirror plan logical repository binding is inconsistent');
  }
  if (sourceAdapter.descriptor_digest === targetAdapter.descriptor_digest) {
    throw new ValidationError('source mirror plan requires distinct source and target adapters');
  }
  if (sourceAdapter.object_format !== state.object_format || targetAdapter.object_format !== state.object_format) {
    throw new ValidationError('source mirror plan Git object format is inconsistent');
  }
  if (!['local_git', 'bare_git'].includes(sourceAdapter.transport)) {
    throw new ValidationError('source mirror v1 source adapter must be local Git');
  }
  if (targetAdapter.transport !== 'bare_git') {
    throw new ValidationError('source mirror v1 target adapter must be bare Git');
  }
  if (
    !repositoryAdapterSupports(sourceAdapter, 'mirror.publish')
    || !repositoryAdapterSupports(targetAdapter, 'mirror.fetch')
  ) {
    throw new ValidationError('source mirror adapters do not expose the required technical operation ceilings');
  }
  if (sourceOperation.operation !== 'mirror.publish' || targetOperation.operation !== 'mirror.fetch') {
    throw new ValidationError('source mirror plan operations are invalid');
  }
  const sourceAdmission = authorizeRepositoryAdapterOperation({
    descriptor: sourceAdapter,
    operation: sourceOperation,
    now
  });
  const targetAdmission = authorizeRepositoryAdapterOperation({
    descriptor: targetAdapter,
    operation: targetOperation,
    now
  });
  if (sourceOperation.request_digest !== targetOperation.request_digest) {
    throw new ValidationError('source mirror operations do not bind one exact request');
  }
  if (sourceOperation.authority_digest !== targetOperation.authority_digest) {
    throw new ValidationError('source mirror operations do not bind one exact authority');
  }
  const targetRef = sourceMirrorAcceptedRef(state.state_digest);
  if (value.target_ref !== targetRef) {
    throw new ValidationError('source mirror target ref does not match the accepted-state namespace');
  }
  if (value.expected_commit_oid !== state.commit_oid) {
    throw new ValidationError('source mirror expected commit does not match the source state');
  }
  if (
    value.retention_mode !== 'append_only_accepted_state_refs'
    || value.delete_allowed !== false
    || value.force_update_allowed !== false
    || value.provider_api_required !== false
    || value.network_required !== false
    || value.execution_authorized !== false
  ) {
    throw new ValidationError('source mirror plan safety boundary is weakened');
  }
  const plannedAt = iso(value.planned_at, 'planned_at');
  const expiresAt = iso(value.expires_at, 'expires_at');
  if (enforceFreshness) boundedLifetime(plannedAt, expiresAt, now);
  return {
    schema: SOURCE_MIRROR_PLAN_SCHEMA,
    repository_id: state.repository_id,
    source_state: state,
    source_adapter: sourceAdapter,
    target_adapter: targetAdapter,
    source_operation: sourceOperation,
    target_operation: targetOperation,
    target_ref: targetRef,
    expected_commit_oid: state.commit_oid,
    retention_mode: 'append_only_accepted_state_refs',
    delete_allowed: false,
    force_update_allowed: false,
    provider_api_required: false,
    network_required: false,
    execution_authorized: false,
    planned_at: plannedAt,
    expires_at: expiresAt,
    technical_ceiling_only: {
      source_allowed_by_adapter: sourceAdmission.allowed_by_adapter_ceiling,
      target_allowed_by_adapter: targetAdmission.allowed_by_adapter_ceiling,
      execution_authorized: false
    }
  };
}

export function buildSourceMirrorPlan({
  identity,
  source_state,
  source_adapter,
  target_adapter,
  source_operation,
  target_operation,
  planned_at = new Date().toISOString(),
  expires_at
}) {
  if (!identity?.keyId?.startsWith('repository-operator:') || typeof identity.signObject !== 'function') {
    throw new ValidationError('source mirror plan requires repository-operator signing identity');
  }
  const plannedAt = iso(planned_at, 'planned_at');
  const expiresAt = expires_at === undefined
    ? new Date(new Date(plannedAt).valueOf() + 5 * 60_000).toISOString()
    : iso(expires_at, 'expires_at');
  const state = normalizeSourceState(source_state);
  const body = normalizePlanBody({
    schema: SOURCE_MIRROR_PLAN_SCHEMA,
    repository_id: state.repository_id,
    source_state: state,
    source_adapter,
    target_adapter,
    source_operation,
    target_operation,
    target_ref: sourceMirrorAcceptedRef(state.state_digest),
    expected_commit_oid: state.commit_oid,
    retention_mode: 'append_only_accepted_state_refs',
    delete_allowed: false,
    force_update_allowed: false,
    provider_api_required: false,
    network_required: false,
    execution_authorized: false,
    planned_at: plannedAt,
    expires_at: expiresAt
  }, { now: plannedAt });
  const { technical_ceiling_only: ignored, ...canonicalBody } = body;
  const planDigest = digestObject(canonicalBody);
  const content = {
    ...canonicalBody,
    plan_id: `source-mirror-plan:${planDigest}`,
    plan_digest: planDigest
  };
  return {
    ...content,
    attestation: identity.signObject(content)
  };
}

export function verifySourceMirrorPlan(raw, {
  operatorPublicKey,
  now = new Date().toISOString()
}) {
  const value = assertPlainObject(raw, 'source mirror plan');
  const planId = assertString(value.plan_id, 'plan_id', { max: 256, pattern: PLAN_ID });
  const planDigest = digest(value.plan_digest, 'plan_digest');
  const attestation = assertPlainObject(value.attestation, 'attestation');
  const { plan_id: ignoredId, plan_digest: ignoredDigest, attestation: ignoredAttestation, ...rawBody } = value;
  const normalized = normalizePlanBody(rawBody, { now });
  const { technical_ceiling_only: ignoredTechnical, ...body } = normalized;
  const expectedDigest = digestObject(body);
  if (planDigest !== expectedDigest || planId !== `source-mirror-plan:${expectedDigest}`) {
    throw new ValidationError('source mirror plan is not content-addressed');
  }
  if (
    attestation.algorithm !== 'Ed25519'
    || typeof attestation.key_id !== 'string'
    || !attestation.key_id.startsWith('repository-operator:')
    || !verifyObjectSignature(
      { ...body, plan_id: planId, plan_digest: planDigest },
      attestation,
      operatorPublicKey
    )
  ) {
    throw new ValidationError('source mirror plan signature is invalid');
  }
  return {
    ...JSON.parse(canonicalJson(body)),
    plan_id: planId,
    plan_digest: planDigest,
    attestation: JSON.parse(canonicalJson(attestation)),
    execution_authorized: false
  };
}
