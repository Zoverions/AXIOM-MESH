import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';

export const REPOSITORY_DOCS_PLAN_SCHEMA = 'axiom-repository-docs-effect-plan.v1';
export const EXTERNAL_EFFECT_PREPARED_SCHEMA = 'axiom-external-effect-prepared.v1';
export const EXTERNAL_EFFECT_RECEIPT_SCHEMA = 'axiom-external-effect-receipt.v1';

export const REPOSITORY_DOCS_EFFECT_POLICY = Object.freeze({
  repository: 'Zoverions/AXIOM-MESH',
  base_branch: 'main',
  semantic_action: 'repo.docs.update',
  target_action: 'repository.docs.pull-request.create',
  tool: 'adapter.repository-docs-pr',
  capability_id: 'repository.docs-pr',
  allowed_roots: Object.freeze(['docs/']),
  allowed_root_files: Object.freeze(['README.md', 'CONSTITUTION.md']),
  allow_create: true,
  allow_update: true,
  allow_delete: false,
  allow_rename: false,
  allow_binary: false,
  allow_merge: false,
  max_files: 16,
  max_file_bytes: 262_144,
  max_total_bytes: 1_048_576
});

export const REPOSITORY_DOCS_EFFECT_POLICY_DIGEST = digestObject(REPOSITORY_DOCS_EFFECT_POLICY);

const DIGEST = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const NONCE = /^[A-Za-z0-9_-]{16,160}$/;
const MAX_LIFETIME_MS = 15 * 60 * 1000;

function rejectUnknown(value, allowed, name) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${name} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function gitSha(value, name) {
  return assertString(value, name, { min: 40, max: 40, pattern: GIT_SHA });
}

function iso(value, name) {
  const input = assertString(value, name, { max: 64 });
  const date = new Date(input);
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return date.toISOString();
}

function boundedLifetime(issuedAt, expiresAt, now, name) {
  const issued = new Date(issuedAt).valueOf();
  const expires = new Date(expiresAt).valueOf();
  const current = new Date(now).valueOf();
  if (expires <= issued || expires - issued > MAX_LIFETIME_MS) {
    throw new ValidationError(`${name} lifetime must be positive and at most 15 minutes`);
  }
  if (expires <= current) throw new ValidationError(`${name} is expired`);
}

function assertDocsPath(raw) {
  const path = assertString(raw, 'change.path', { min: 1, max: 240 });
  if (
    path.startsWith('/')
    || path.includes('\\')
    || path.includes('\u0000')
    || path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new ValidationError('repository docs effect path is not canonical');
  }
  const allowed = REPOSITORY_DOCS_EFFECT_POLICY.allowed_root_files.includes(path)
    || REPOSITORY_DOCS_EFFECT_POLICY.allowed_roots.some(root => path.startsWith(root));
  if (!allowed) throw new ValidationError(`repository docs effect path is outside the docs-only ceiling: ${path}`);
  return path;
}

function normalizeChange(raw, index) {
  const value = assertPlainObject(raw, `changes[${index}]`);
  rejectUnknown(value, new Set([
    'path', 'operation', 'old_blob_sha', 'old_content_sha256',
    'new_content', 'new_content_sha256', 'new_bytes'
  ]), `changes[${index}]`);
  const path = assertDocsPath(value.path);
  const operation = assertString(value.operation, `changes[${index}].operation`, {
    max: 16,
    pattern: /^(create|update)$/
  });
  const content = assertString(value.new_content, `changes[${index}].new_content`, {
    min: 0,
    max: REPOSITORY_DOCS_EFFECT_POLICY.max_file_bytes
  });
  if (content.includes('\u0000')) throw new ValidationError('repository docs effect does not permit binary/NUL content');
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > REPOSITORY_DOCS_EFFECT_POLICY.max_file_bytes) {
    throw new ValidationError('repository docs effect file exceeds byte ceiling');
  }
  const contentDigest = sha256(content);
  if (value.new_content_sha256 !== undefined && digest(value.new_content_sha256, 'new_content_sha256') !== contentDigest) {
    throw new ValidationError('repository docs effect new content digest is invalid');
  }
  if (value.new_bytes !== undefined && value.new_bytes !== bytes) {
    throw new ValidationError('repository docs effect new byte count is invalid');
  }
  let oldBlobSha = null;
  let oldContentSha256 = null;
  if (operation === 'update') {
    oldBlobSha = gitSha(value.old_blob_sha, 'old_blob_sha');
    oldContentSha256 = digest(value.old_content_sha256, 'old_content_sha256');
  } else if (value.old_blob_sha !== null && value.old_blob_sha !== undefined) {
    throw new ValidationError('repository docs create may not claim an old blob SHA');
  } else if (value.old_content_sha256 !== null && value.old_content_sha256 !== undefined) {
    throw new ValidationError('repository docs create may not claim old content');
  }
  return {
    path,
    operation,
    old_blob_sha: oldBlobSha,
    old_content_sha256: oldContentSha256,
    new_content: content,
    new_content_sha256: contentDigest,
    new_bytes: bytes
  };
}

function normalizeChanges(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > REPOSITORY_DOCS_EFFECT_POLICY.max_files) {
    throw new ValidationError(`repository docs effect requires 1-${REPOSITORY_DOCS_EFFECT_POLICY.max_files} file changes`);
  }
  const changes = raw.map(normalizeChange).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(changes.map(change => change.path)).size !== changes.length) {
    throw new ValidationError('repository docs effect paths must be unique');
  }
  const total = changes.reduce((sum, change) => sum + change.new_bytes, 0);
  if (total > REPOSITORY_DOCS_EFFECT_POLICY.max_total_bytes) {
    throw new ValidationError('repository docs effect exceeds total byte ceiling');
  }
  return changes;
}

function signedContentAddress(body, prefix, identity) {
  const objectDigest = digestObject(body);
  const content = {
    ...body,
    [`${prefix}_id`]: `${prefix}:${objectDigest}`,
    [`${prefix}_digest`]: objectDigest
  };
  return {
    ...content,
    attestation: identity.signObject(content)
  };
}

function verifySignedContentAddress(raw, {
  schema,
  prefix,
  publicKey,
  expectedKeyPrefix,
  bodyValidator
}) {
  const value = assertPlainObject(raw, prefix);
  if (value.schema !== schema) throw new ValidationError(`${prefix} schema must be ${schema}`);
  const id = assertString(value[`${prefix}_id`], `${prefix}_id`, { max: 256 });
  const suppliedDigest = digest(value[`${prefix}_digest`], `${prefix}_digest`);
  const attestation = assertPlainObject(value.attestation, `${prefix}.attestation`);
  const { [`${prefix}_id`]: ignoredId, [`${prefix}_digest`]: ignoredDigest, attestation: ignoredAttestation, ...rawBody } = value;
  const body = bodyValidator(rawBody);
  const expectedDigest = digestObject(body);
  if (suppliedDigest !== expectedDigest || id !== `${prefix}:${expectedDigest}`) {
    throw new ValidationError(`${prefix} is not content-addressed`);
  }
  const signed = { ...body, [`${prefix}_id`]: id, [`${prefix}_digest`]: suppliedDigest };
  if (
    attestation.algorithm !== 'Ed25519'
    || typeof attestation.key_id !== 'string'
    || !attestation.key_id.startsWith(expectedKeyPrefix)
    || !verifyObjectSignature(signed, attestation, publicKey)
  ) {
    throw new ValidationError(`${prefix} signature is invalid`);
  }
  return { ...signed, attestation: structuredClone(attestation) };
}

function planBody(raw, { now = new Date().toISOString(), enforceFreshness = true } = {}) {
  const value = assertPlainObject(raw, 'repository docs plan body');
  rejectUnknown(value, new Set([
    'schema', 'operator', 'repository', 'base_branch', 'base_sha', 'changes',
    'path_policy_digest', 'planned_at', 'expires_at', 'read_only_observation',
    'mutations_performed'
  ]), 'repository docs plan body');
  if (value.schema !== REPOSITORY_DOCS_PLAN_SCHEMA) {
    throw new ValidationError(`repository docs plan schema must be ${REPOSITORY_DOCS_PLAN_SCHEMA}`);
  }
  if (value.operator !== 'repository-operator') throw new ValidationError('repository docs plan operator is invalid');
  if (value.repository !== REPOSITORY_DOCS_EFFECT_POLICY.repository) throw new ValidationError('repository docs plan repository is outside the ceiling');
  if (value.base_branch !== REPOSITORY_DOCS_EFFECT_POLICY.base_branch) throw new ValidationError('repository docs plan base branch is outside the ceiling');
  if (value.path_policy_digest !== REPOSITORY_DOCS_EFFECT_POLICY_DIGEST) {
    throw new ValidationError('repository docs plan path policy digest is invalid');
  }
  if (value.read_only_observation !== true || value.mutations_performed !== false) {
    throw new ValidationError('repository docs planning must be read-only');
  }
  const plannedAt = iso(value.planned_at, 'planned_at');
  const expiresAt = iso(value.expires_at, 'expires_at');
  if (enforceFreshness) boundedLifetime(plannedAt, expiresAt, now, 'repository docs plan');
  return {
    schema: REPOSITORY_DOCS_PLAN_SCHEMA,
    operator: 'repository-operator',
    repository: REPOSITORY_DOCS_EFFECT_POLICY.repository,
    base_branch: REPOSITORY_DOCS_EFFECT_POLICY.base_branch,
    base_sha: gitSha(value.base_sha, 'base_sha'),
    changes: normalizeChanges(value.changes),
    path_policy_digest: REPOSITORY_DOCS_EFFECT_POLICY_DIGEST,
    planned_at: plannedAt,
    expires_at: expiresAt,
    read_only_observation: true,
    mutations_performed: false
  };
}

export function buildRepositoryDocsEffectPlan({
  identity,
  base_sha,
  changes,
  planned_at = new Date().toISOString(),
  expires_at
}) {
  if (!identity?.keyId?.startsWith('repository-operator:') || typeof identity.signObject !== 'function') {
    throw new ValidationError('repository docs plan requires repository-operator signing identity');
  }
  const plannedAt = iso(planned_at, 'planned_at');
  const expiresAt = expires_at === undefined
    ? new Date(new Date(plannedAt).valueOf() + 5 * 60 * 1000).toISOString()
    : iso(expires_at, 'expires_at');
  const body = planBody({
    schema: REPOSITORY_DOCS_PLAN_SCHEMA,
    operator: 'repository-operator',
    repository: REPOSITORY_DOCS_EFFECT_POLICY.repository,
    base_branch: REPOSITORY_DOCS_EFFECT_POLICY.base_branch,
    base_sha,
    changes,
    path_policy_digest: REPOSITORY_DOCS_EFFECT_POLICY_DIGEST,
    planned_at: plannedAt,
    expires_at: expiresAt,
    read_only_observation: true,
    mutations_performed: false
  }, { now: plannedAt });
  return signedContentAddress(body, 'plan', identity);
}

export function verifyRepositoryDocsEffectPlan(raw, {
  operatorPublicKey,
  now = new Date().toISOString()
}) {
  return verifySignedContentAddress(raw, {
    schema: REPOSITORY_DOCS_PLAN_SCHEMA,
    prefix: 'plan',
    publicKey: operatorPublicKey,
    expectedKeyPrefix: 'repository-operator:',
    bodyValidator: body => planBody(body, { now })
  });
}

function sourceBindings(raw) {
  const value = assertPlainObject(raw, 'source_bindings');
  rejectUnknown(value, new Set([
    'intent_id', 'intent_digest', 'handoff_digest', 'remediation_proposal_id',
    'remediation_proposal_digest', 'principal', 'machine_authority_digest'
  ]), 'source_bindings');
  return {
    intent_id: assertString(value.intent_id, 'source_bindings.intent_id', { max: 160, pattern: ID }),
    intent_digest: digest(value.intent_digest, 'source_bindings.intent_digest'),
    handoff_digest: digest(value.handoff_digest, 'source_bindings.handoff_digest'),
    remediation_proposal_id: assertString(value.remediation_proposal_id, 'source_bindings.remediation_proposal_id', { max: 192 }),
    remediation_proposal_digest: digest(value.remediation_proposal_digest, 'source_bindings.remediation_proposal_digest'),
    principal: assertString(value.principal, 'source_bindings.principal', { max: 160, pattern: ID }),
    machine_authority_digest: value.machine_authority_digest === null || value.machine_authority_digest === undefined
      ? null
      : digest(value.machine_authority_digest, 'source_bindings.machine_authority_digest')
  };
}

function authorityBindings(raw) {
  const value = assertPlainObject(raw, 'authority_bindings');
  rejectUnknown(value, new Set([
    'policy_digest', 'capability_registry_digest', 'executor_registry_digest',
    'mapping_digest', 'build_digest'
  ]), 'authority_bindings');
  return {
    policy_digest: digest(value.policy_digest, 'authority_bindings.policy_digest'),
    capability_registry_digest: digest(value.capability_registry_digest, 'authority_bindings.capability_registry_digest'),
    executor_registry_digest: digest(value.executor_registry_digest, 'authority_bindings.executor_registry_digest'),
    mapping_digest: digest(value.mapping_digest, 'authority_bindings.mapping_digest'),
    build_digest: digest(value.build_digest, 'authority_bindings.build_digest')
  };
}

function preparedBody(raw, {
  operatorPublicKey,
  now = new Date().toISOString(),
  enforceFreshness = true
} = {}) {
  const value = assertPlainObject(raw, 'external effect prepared body');
  rejectUnknown(value, new Set([
    'schema', 'issuer', 'effect_class', 'semantic_action', 'target_action', 'tool',
    'capability_id', 'plan', 'source_bindings', 'authority_bindings',
    'path_policy_digest', 'one_use_nonce', 'prepared_at', 'expires_at',
    'external_effect_executed', 'execution_authorized', 'merge_authorized'
  ]), 'external effect prepared body');
  if (value.schema !== EXTERNAL_EFFECT_PREPARED_SCHEMA) {
    throw new ValidationError(`external effect prepared schema must be ${EXTERNAL_EFFECT_PREPARED_SCHEMA}`);
  }
  if (value.issuer !== 'hypervisor') throw new ValidationError('external effect preparer must be hypervisor');
  if (value.effect_class !== 'repository.docs.pull-request') throw new ValidationError('external effect class is invalid');
  if (
    value.semantic_action !== REPOSITORY_DOCS_EFFECT_POLICY.semantic_action
    || value.target_action !== REPOSITORY_DOCS_EFFECT_POLICY.target_action
    || value.tool !== REPOSITORY_DOCS_EFFECT_POLICY.tool
    || value.capability_id !== REPOSITORY_DOCS_EFFECT_POLICY.capability_id
  ) {
    throw new ValidationError('external effect target is outside the docs-only executor ceiling');
  }
  if (value.path_policy_digest !== REPOSITORY_DOCS_EFFECT_POLICY_DIGEST) {
    throw new ValidationError('external effect path policy digest is invalid');
  }
  if (value.external_effect_executed !== false || value.execution_authorized !== false || value.merge_authorized !== false) {
    throw new ValidationError('prepared external effect must remain unexecuted and non-authorizing');
  }
  const preparedAt = iso(value.prepared_at, 'prepared_at');
  const expiresAt = iso(value.expires_at, 'expires_at');
  if (enforceFreshness) boundedLifetime(preparedAt, expiresAt, now, 'prepared external effect');
  const plan = operatorPublicKey
    ? verifyRepositoryDocsEffectPlan(value.plan, { operatorPublicKey, now: enforceFreshness ? now : preparedAt })
    : structuredClone(assertPlainObject(value.plan, 'plan'));
  return {
    schema: EXTERNAL_EFFECT_PREPARED_SCHEMA,
    issuer: 'hypervisor',
    effect_class: 'repository.docs.pull-request',
    semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
    target_action: REPOSITORY_DOCS_EFFECT_POLICY.target_action,
    tool: REPOSITORY_DOCS_EFFECT_POLICY.tool,
    capability_id: REPOSITORY_DOCS_EFFECT_POLICY.capability_id,
    plan,
    source_bindings: sourceBindings(value.source_bindings),
    authority_bindings: authorityBindings(value.authority_bindings),
    path_policy_digest: REPOSITORY_DOCS_EFFECT_POLICY_DIGEST,
    one_use_nonce: assertString(value.one_use_nonce, 'one_use_nonce', { max: 160, pattern: NONCE }),
    prepared_at: preparedAt,
    expires_at: expiresAt,
    external_effect_executed: false,
    execution_authorized: false,
    merge_authorized: false
  };
}

export function buildPreparedRepositoryDocsEffect({
  identity,
  plan,
  operatorPublicKey,
  source_bindings,
  authority_bindings,
  one_use_nonce,
  prepared_at = new Date().toISOString(),
  expires_at
}) {
  if (!identity?.keyId?.startsWith('hypervisor:') || typeof identity.signObject !== 'function') {
    throw new ValidationError('prepared external effect requires hypervisor signing identity');
  }
  const preparedAt = iso(prepared_at, 'prepared_at');
  const expiresAt = expires_at === undefined
    ? new Date(new Date(preparedAt).valueOf() + 5 * 60 * 1000).toISOString()
    : iso(expires_at, 'expires_at');
  const verifiedPlan = verifyRepositoryDocsEffectPlan(plan, {
    operatorPublicKey,
    now: preparedAt
  });
  const body = preparedBody({
    schema: EXTERNAL_EFFECT_PREPARED_SCHEMA,
    issuer: 'hypervisor',
    effect_class: 'repository.docs.pull-request',
    semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
    target_action: REPOSITORY_DOCS_EFFECT_POLICY.target_action,
    tool: REPOSITORY_DOCS_EFFECT_POLICY.tool,
    capability_id: REPOSITORY_DOCS_EFFECT_POLICY.capability_id,
    plan: verifiedPlan,
    source_bindings,
    authority_bindings,
    path_policy_digest: REPOSITORY_DOCS_EFFECT_POLICY_DIGEST,
    one_use_nonce,
    prepared_at: preparedAt,
    expires_at: expiresAt,
    external_effect_executed: false,
    execution_authorized: false,
    merge_authorized: false
  }, { operatorPublicKey, now: preparedAt });
  return signedContentAddress(body, 'effect', identity);
}

export function verifyPreparedRepositoryDocsEffect(raw, {
  hypervisorPublicKey,
  operatorPublicKey,
  now = new Date().toISOString()
}) {
  return verifySignedContentAddress(raw, {
    schema: EXTERNAL_EFFECT_PREPARED_SCHEMA,
    prefix: 'effect',
    publicKey: hypervisorPublicKey,
    expectedKeyPrefix: 'hypervisor:',
    bodyValidator: body => preparedBody(body, { operatorPublicKey, now })
  });
}

export function repositoryDocsEffectBranch(effectDigest) {
  const value = digest(effectDigest, 'effect_digest');
  return `axiom/intent-docs-${value.slice(0, 20)}`;
}

function normalizeAppliedFiles(raw, plan) {
  if (!Array.isArray(raw) || raw.length !== plan.changes.length) {
    throw new ValidationError('repository effect receipt applied files must exactly cover the plan');
  }
  const expected = new Map(plan.changes.map(change => [change.path, change]));
  const files = raw.map((item, index) => {
    const value = assertPlainObject(item, `applied_files[${index}]`);
    rejectUnknown(value, new Set(['path', 'new_content_sha256', 'observed_blob_sha']), `applied_files[${index}]`);
    const path = assertDocsPath(value.path);
    const planned = expected.get(path);
    if (!planned) throw new ValidationError('repository effect receipt includes an unplanned file');
    if (digest(value.new_content_sha256, 'applied_file.new_content_sha256') !== planned.new_content_sha256) {
      throw new ValidationError('repository effect receipt content digest does not match the plan');
    }
    return {
      path,
      new_content_sha256: planned.new_content_sha256,
      observed_blob_sha: gitSha(value.observed_blob_sha, 'applied_file.observed_blob_sha')
    };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(files.map(file => file.path)).size !== files.length) {
    throw new ValidationError('repository effect receipt applied files must be unique');
  }
  return files;
}

function receiptBody(raw, { prepared, observedAt }) {
  const value = assertPlainObject(raw, 'external effect receipt body');
  rejectUnknown(value, new Set([
    'schema', 'operator', 'effect_id', 'effect_digest', 'plan_id', 'plan_digest',
    'repository', 'base_branch', 'base_sha', 'branch', 'head_sha', 'pull_request_number',
    'pull_request_id', 'applied_files', 'observed_at', 'already_applied',
    'external_effect_executed', 'mapping_installed_observed', 'merge_performed',
    'base_branch_content_changed', 'execution_authorized', 'remediation_converged'
  ]), 'external effect receipt body');
  if (value.schema !== EXTERNAL_EFFECT_RECEIPT_SCHEMA) {
    throw new ValidationError(`external effect receipt schema must be ${EXTERNAL_EFFECT_RECEIPT_SCHEMA}`);
  }
  if (value.operator !== 'repository-operator') throw new ValidationError('repository effect receipt operator is invalid');
  if (value.effect_id !== prepared.effect_id || value.effect_digest !== prepared.effect_digest) {
    throw new ValidationError('repository effect receipt is not bound to the prepared effect');
  }
  if (value.plan_id !== prepared.plan.plan_id || value.plan_digest !== prepared.plan.plan_digest) {
    throw new ValidationError('repository effect receipt is not bound to the signed plan');
  }
  if (
    value.repository !== prepared.plan.repository
    || value.base_branch !== prepared.plan.base_branch
    || value.base_sha !== prepared.plan.base_sha
  ) {
    throw new ValidationError('repository effect receipt repository/base binding is invalid');
  }
  const expectedBranch = repositoryDocsEffectBranch(prepared.effect_digest);
  if (value.branch !== expectedBranch) throw new ValidationError('repository effect receipt branch is not deterministic');
  if (
    value.external_effect_executed !== true
    || value.mapping_installed_observed !== true
    || value.merge_performed !== false
    || value.base_branch_content_changed !== false
    || value.execution_authorized !== false
    || value.remediation_converged !== false
  ) {
    throw new ValidationError('repository effect receipt authority/status claims are invalid');
  }
  if (!Number.isSafeInteger(value.pull_request_number) || value.pull_request_number <= 0) {
    throw new ValidationError('repository effect receipt pull_request_number must be positive');
  }
  const observed = iso(value.observed_at, 'observed_at');
  if (observedAt !== undefined && observed > iso(observedAt, 'current observed time')) {
    throw new ValidationError('repository effect receipt observation is in the future');
  }
  return {
    schema: EXTERNAL_EFFECT_RECEIPT_SCHEMA,
    operator: 'repository-operator',
    effect_id: prepared.effect_id,
    effect_digest: prepared.effect_digest,
    plan_id: prepared.plan.plan_id,
    plan_digest: prepared.plan.plan_digest,
    repository: prepared.plan.repository,
    base_branch: prepared.plan.base_branch,
    base_sha: prepared.plan.base_sha,
    branch: expectedBranch,
    head_sha: gitSha(value.head_sha, 'head_sha'),
    pull_request_number: value.pull_request_number,
    pull_request_id: assertString(value.pull_request_id, 'pull_request_id', { max: 192, pattern: ID }),
    applied_files: normalizeAppliedFiles(value.applied_files, prepared.plan),
    observed_at: observed,
    already_applied: value.already_applied === true,
    external_effect_executed: true,
    mapping_installed_observed: true,
    merge_performed: false,
    base_branch_content_changed: false,
    execution_authorized: false,
    remediation_converged: false
  };
}

export function buildRepositoryDocsEffectReceipt({
  identity,
  prepared_effect,
  hypervisorPublicKey,
  operatorPublicKey,
  head_sha,
  pull_request_number,
  pull_request_id,
  applied_files,
  observed_at = new Date().toISOString(),
  already_applied = false
}) {
  if (!identity?.keyId?.startsWith('repository-operator:') || typeof identity.signObject !== 'function') {
    throw new ValidationError('repository effect receipt requires repository-operator signing identity');
  }
  const prepared = verifyPreparedRepositoryDocsEffect(prepared_effect, {
    hypervisorPublicKey,
    operatorPublicKey,
    now: observed_at
  });
  const body = receiptBody({
    schema: EXTERNAL_EFFECT_RECEIPT_SCHEMA,
    operator: 'repository-operator',
    effect_id: prepared.effect_id,
    effect_digest: prepared.effect_digest,
    plan_id: prepared.plan.plan_id,
    plan_digest: prepared.plan.plan_digest,
    repository: prepared.plan.repository,
    base_branch: prepared.plan.base_branch,
    base_sha: prepared.plan.base_sha,
    branch: repositoryDocsEffectBranch(prepared.effect_digest),
    head_sha,
    pull_request_number,
    pull_request_id,
    applied_files,
    observed_at,
    already_applied,
    external_effect_executed: true,
    mapping_installed_observed: true,
    merge_performed: false,
    base_branch_content_changed: false,
    execution_authorized: false,
    remediation_converged: false
  }, { prepared, observedAt: observed_at });
  return signedContentAddress(body, 'receipt', identity);
}

export function verifyRepositoryDocsEffectReceipt(raw, {
  prepared_effect,
  hypervisorPublicKey,
  operatorPublicKey,
  now = new Date().toISOString()
}) {
  const prepared = verifyPreparedRepositoryDocsEffect(prepared_effect, {
    hypervisorPublicKey,
    operatorPublicKey,
    now
  });
  return verifySignedContentAddress(raw, {
    schema: EXTERNAL_EFFECT_RECEIPT_SCHEMA,
    prefix: 'receipt',
    publicKey: operatorPublicKey,
    expectedKeyPrefix: 'repository-operator:',
    bodyValidator: body => receiptBody(body, { prepared, observedAt: now })
  });
}

export function repositoryDocsEffectSummary(rawPrepared) {
  const value = assertPlainObject(rawPrepared, 'prepared effect');
  return JSON.parse(canonicalJson({
    effect_id: value.effect_id,
    effect_digest: value.effect_digest,
    repository: value.plan?.repository,
    base_branch: value.plan?.base_branch,
    base_sha: value.plan?.base_sha,
    branch: typeof value.effect_digest === 'string' && DIGEST.test(value.effect_digest)
      ? repositoryDocsEffectBranch(value.effect_digest)
      : null,
    paths: Array.isArray(value.plan?.changes)
      ? value.plan.changes.map(change => change.path).sort()
      : [],
    merge_authorized: false
  }));
}
