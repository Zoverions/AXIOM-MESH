import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import {
  validateCapabilityEvidenceBindings,
  validateCapabilityRegistry
} from '../check-registry.mjs';

export const AGENT_TRUST_PROMOTION_PREFLIGHT_SCHEMA =
  'axiom-agent-trust-promotion-preflight.v1';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const REGISTRY_PATH = 'mesh/config/capabilities.json';
const BINDINGS_PATH = 'mesh/config/capability-evidence-bindings.json';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const CAPABILITY_ID = /^[a-z][a-z0-9.-]+$/;
const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY_PATH = /^[A-Za-z0-9_.\/-]+$/;
const BLOCKER = /^[a-z0-9][a-z0-9.-]{1,95}$/;

const REQUIRED_BLOCKERS = Object.freeze([
  'authoritative-registry-entry-required',
  'exact-registry-evidence-binding-required',
  'explicit-promotion-decision-required',
  'independent-review-required',
  'post-registry-protected-ci-required',
  'protected-ci-exact-head-required'
]);

const TOP_KEYS = new Set([
  'schema',
  'candidate_id',
  'capability_id',
  'candidate_commit_sha',
  'candidate_scope',
  'artifact_paths',
  'blockers',
  'semantics',
  'preflight_digest'
]);

const ARTIFACT_KEYS = new Set([
  'implementation',
  'strict_validation',
  'positive_tests',
  'adversarial_tests',
  'threat_models',
  'recovery_runbooks',
  'verifier_or_conformance'
]);

const SEMANTIC_KEYS = new Set([
  'evaluation_scope',
  'documentation_alone_satisfies_promotion',
  'local_preflight_is_promotion',
  'candidate_record_mutates_registry',
  'protected_ci_required',
  'independent_review_required',
  'explicit_promotion_decision_required',
  'exact_registry_evidence_binding_required',
  'post_registry_change_ci_required',
  'promotion_authorized',
  'registry_mutation_authorized',
  'production_claims_allowed',
  'authority_effect',
  'capability_promotion_effect'
]);

const FIXED_SEMANTICS = Object.freeze({
  evaluation_scope: 'local-structural-promotion-preflight-only',
  documentation_alone_satisfies_promotion: false,
  local_preflight_is_promotion: false,
  candidate_record_mutates_registry: false,
  protected_ci_required: true,
  independent_review_required: true,
  explicit_promotion_decision_required: true,
  exact_registry_evidence_binding_required: true,
  post_registry_change_ci_required: true,
  promotion_authorized: false,
  registry_mutation_authorized: false,
  production_claims_allowed: false,
  authority_effect: 'none',
  capability_promotion_effect: 'none'
});

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function repositoryPath(value, label) {
  return assertString(value, label, { min: 1, max: 320, pattern: REPOSITORY_PATH });
}

function normalizePathList(raw, label, kind) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 64) {
    throw new ValidationError(`${label} must contain 1-64 repository paths`);
  }
  const paths = raw.map((item, index) => repositoryPath(item, `${label}[${index}]`));
  if (new Set(paths).size !== paths.length) throw new ValidationError(`${label} contains duplicates`);
  const sorted = [...paths].sort();
  if (canonicalJson(paths) !== canonicalJson(sorted)) {
    throw new ValidationError(`${label} must be sorted`);
  }

  const rules = {
    implementation: path => path.endsWith('.mjs'),
    strict_validation: path => path.endsWith('.mjs') || path.endsWith('.schema.json'),
    positive_tests: path => path.endsWith('.test.mjs'),
    adversarial_tests: path => path.endsWith('.test.mjs'),
    threat_models: path => path.endsWith('-threat-model.json'),
    recovery_runbooks: path => path.endsWith('.md'),
    verifier_or_conformance: path => path.endsWith('.mjs') || path.endsWith('.test.mjs')
  };
  if (!rules[kind] || paths.some(path => !rules[kind](path))) {
    throw new ValidationError(`${label} contains a path with an invalid artifact type`);
  }
  return Object.freeze(paths);
}

function normalizeArtifactPaths(raw) {
  const value = exactObject(raw, ARTIFACT_KEYS, 'Agent Trust promotion artifact_paths');
  const normalized = {};
  for (const key of ARTIFACT_KEYS) {
    normalized[key] = normalizePathList(
      value[key],
      `Agent Trust promotion artifact_paths.${key}`,
      key
    );
  }
  return Object.freeze(normalized);
}

function normalizeBlockers(raw) {
  if (!Array.isArray(raw) || raw.length < REQUIRED_BLOCKERS.length || raw.length > 64) {
    throw new ValidationError('Agent Trust promotion blockers must contain required external gates');
  }
  const values = raw.map((item, index) => assertString(
    item,
    `Agent Trust promotion blocker[${index}]`,
    { min: 2, max: 96, pattern: BLOCKER }
  ));
  if (new Set(values).size !== values.length) {
    throw new ValidationError('Agent Trust promotion blockers contain duplicates');
  }
  const sorted = [...values].sort();
  if (canonicalJson(values) !== canonicalJson(sorted)) {
    throw new ValidationError('Agent Trust promotion blockers must be sorted');
  }
  for (const blocker of REQUIRED_BLOCKERS) {
    if (!values.includes(blocker)) {
      throw new ValidationError(`Agent Trust promotion blockers must retain ${blocker}`);
    }
  }
  return Object.freeze(values);
}

function normalizeSemantics(raw) {
  const value = exactObject(raw, SEMANTIC_KEYS, 'Agent Trust promotion semantics');
  for (const [key, expected] of Object.entries(FIXED_SEMANTICS)) {
    if (value[key] !== expected) {
      throw new ValidationError(`Agent Trust promotion ${key} must remain ${String(expected)}`);
    }
  }
  return FIXED_SEMANTICS;
}

export function createAgentTrustPromotionPreflight({
  candidateId,
  capabilityId,
  candidateCommitSha,
  candidateScope,
  artifactPaths,
  additionalBlockers = []
} = {}) {
  if (!Array.isArray(additionalBlockers) || additionalBlockers.length > 58) {
    throw new ValidationError('Agent Trust promotion additionalBlockers must contain at most 58 values');
  }
  const blockers = [...new Set([
    ...REQUIRED_BLOCKERS,
    ...additionalBlockers
  ])].sort();
  const body = Object.freeze({
    schema: AGENT_TRUST_PROMOTION_PREFLIGHT_SCHEMA,
    candidate_id: assertString(candidateId, 'Agent Trust promotion candidateId', {
      min: 1,
      max: 192,
      pattern: ID
    }),
    capability_id: assertString(capabilityId, 'Agent Trust promotion capabilityId', {
      min: 3,
      max: 128,
      pattern: CAPABILITY_ID
    }),
    candidate_commit_sha: assertString(candidateCommitSha, 'Agent Trust promotion candidateCommitSha', {
      min: 40,
      max: 40,
      pattern: SHA
    }),
    candidate_scope: assertString(candidateScope, 'Agent Trust promotion candidateScope', {
      min: 20,
      max: 1000
    }),
    artifact_paths: normalizeArtifactPaths(artifactPaths),
    blockers: normalizeBlockers(blockers),
    semantics: FIXED_SEMANTICS
  });
  const preflight = Object.freeze({ ...body, preflight_digest: digestObject(body) });
  return normalizeAgentTrustPromotionPreflight(preflight);
}

export function normalizeAgentTrustPromotionPreflight(raw) {
  const value = exactObject(raw, TOP_KEYS, 'Agent Trust promotion preflight');
  if (value.schema !== AGENT_TRUST_PROMOTION_PREFLIGHT_SCHEMA) {
    throw new ValidationError(
      `Agent Trust promotion preflight schema must be ${AGENT_TRUST_PROMOTION_PREFLIGHT_SCHEMA}`
    );
  }
  const body = Object.freeze({
    schema: AGENT_TRUST_PROMOTION_PREFLIGHT_SCHEMA,
    candidate_id: assertString(value.candidate_id, 'Agent Trust promotion candidate_id', {
      min: 1,
      max: 192,
      pattern: ID
    }),
    capability_id: assertString(value.capability_id, 'Agent Trust promotion capability_id', {
      min: 3,
      max: 128,
      pattern: CAPABILITY_ID
    }),
    candidate_commit_sha: assertString(
      value.candidate_commit_sha,
      'Agent Trust promotion candidate_commit_sha',
      { min: 40, max: 40, pattern: SHA }
    ),
    candidate_scope: assertString(value.candidate_scope, 'Agent Trust promotion candidate_scope', {
      min: 20,
      max: 1000
    }),
    artifact_paths: normalizeArtifactPaths(value.artifact_paths),
    blockers: normalizeBlockers(value.blockers),
    semantics: normalizeSemantics(value.semantics)
  });
  const suppliedDigest = assertString(value.preflight_digest, 'Agent Trust promotion preflight_digest', {
    min: 64,
    max: 64,
    pattern: /^[a-f0-9]{64}$/
  });
  if (suppliedDigest !== digestObject(body)) {
    throw new ValidationError('Agent Trust promotion preflight content digest mismatch');
  }
  return Object.freeze({ ...body, preflight_digest: suppliedDigest });
}

function ensureInsideRepository(root, absolute, label) {
  const rel = relative(root, absolute);
  if (
    rel === '..'
    || rel.startsWith(`..${sep}`)
    || isAbsolute(rel)
  ) {
    throw new ValidationError(`${label} escapes repository root`);
  }
}

async function requireRegularRepositoryFile(root, repositoryPathValue, label) {
  const repositoryPathText = repositoryPath(repositoryPathValue, label);
  const absolute = resolve(root, repositoryPathText);
  ensureInsideRepository(root, absolute, label);
  let metadata;
  try {
    metadata = await lstat(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new ValidationError(`${label} does not exist: ${repositoryPathText}`);
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new ValidationError(`${label} must be a regular non-symlink file`);
  }
  const canonical = await realpath(absolute);
  ensureInsideRepository(root, canonical, label);
  if (resolve(canonical) !== resolve(absolute)) {
    throw new ValidationError(`${label} cannot traverse filesystem links`);
  }
  return canonical;
}

async function readRepositoryJson(root, repositoryPathValue, label) {
  const absolute = await requireRegularRepositoryFile(root, repositoryPathValue, label);
  try {
    return JSON.parse(await readFile(absolute, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ValidationError(`${label} must contain valid JSON`);
    throw error;
  }
}

export async function verifyAgentTrustPromotionPreflight(raw, {
  repositoryRoot = REPOSITORY_ROOT
} = {}) {
  const preflight = normalizeAgentTrustPromotionPreflight(raw);
  const root = await realpath(resolve(repositoryRoot));

  const registry = await readRepositoryJson(root, REGISTRY_PATH, 'Agent Trust authoritative capability registry');
  const registryStatus = validateCapabilityRegistry(registry);
  const bindingsStatus = await validateCapabilityEvidenceBindings(registry, {
    repositoryRoot: root,
    bindingsPath: resolve(root, BINDINGS_PATH)
  });

  const existingCapability = (registry.capabilities ?? []).find(
    item => item.id === preflight.capability_id
  ) ?? null;
  if (existingCapability !== null) {
    throw new ValidationError(
      `Agent Trust promotion preflight capability ${preflight.capability_id} is already present in the authoritative registry; preflight cannot authorize or validate a post-mutation promotion state`
    );
  }

  let artifactCount = 0;
  for (const [kind, paths] of Object.entries(preflight.artifact_paths)) {
    for (const path of paths) {
      await requireRegularRepositoryFile(root, path, `Agent Trust promotion ${kind} artifact`);
      artifactCount += 1;
    }
  }

  return Object.freeze({
    valid: true,
    schema: 'axiom-agent-trust-promotion-preflight-result.v1',
    candidate_id: preflight.candidate_id,
    capability_id: preflight.capability_id,
    candidate_commit_sha: preflight.candidate_commit_sha,
    preflight_digest: preflight.preflight_digest,
    local_repository_artifacts_verified: true,
    local_artifact_paths_checked: artifactCount,
    authoritative_registry_valid: registryStatus.valid === true,
    authoritative_registry_digest: registryStatus.digest,
    capability_evidence_bindings_valid: bindingsStatus.valid === true,
    capability_evidence_bindings_digest: bindingsStatus.digest,
    candidate_registry_entry_present: false,
    candidate_commit_recorded: true,
    candidate_commit_bound_by_verifier: false,
    protected_ci_verified: false,
    independent_review_verified: false,
    explicit_promotion_decision_verified: false,
    post_registry_ci_verified: false,
    exact_candidate_registry_binding_verified: false,
    promotion_authorized: false,
    registry_mutation_authorized: false,
    production_claims_allowed: false,
    blockers: preflight.blockers,
    authority_effect: 'none',
    capability_promotion_effect: 'none'
  });
}

export const AGENT_TRUST_PROMOTION_REQUIRED_EXTERNAL_GATES = REQUIRED_BLOCKERS;
