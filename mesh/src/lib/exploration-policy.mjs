import { canonicalize, digestObject, ValidationError } from './canonical.mjs';
import {
  assertBoundedId,
  assertCanonicalInstant,
  assertExactKeys,
  assertSafeNonNegativeInteger,
  assertSha256,
  deepFreezeJson
} from './replay-grounded-common.mjs';

export const EXPLORATION_POLICY_SCHEMA = 'axiom-exploration-policy.v0';
export const REPLAY_POLICY_INTERFACE = 'axiom-replay-policy-interface.v0';
export const REPLAY_OBSERVATION_SCHEMA = 'axiom-replay-observation.v0';

const POLICY_KEYS = Object.freeze([
  'schema', 'status', 'policy_id', 'version', 'artifact_digest', 'implementation',
  'interface_version', 'observation_schema', 'derived_features', 'max_internal_state_bytes',
  'proposer', 'created_at', 'authority_effect', 'network_effect', 'runtime_activation',
  'production_promotion'
]);
const PROPOSER_KINDS = new Set(['human', 'agent', 'optimizer', 'imported', 'unknown']);

function literal(actual, expected, name) {
  if (actual !== expected) throw new ValidationError(`${name} must equal ${JSON.stringify(expected)}`);
}

export function validateExplorationPolicy(input) {
  const policy = canonicalize(input);
  assertExactKeys(policy, POLICY_KEYS, 'exploration_policy');
  literal(policy.schema, EXPLORATION_POLICY_SCHEMA, 'schema');
  literal(policy.status, 'inert-policy-manifest', 'status');
  assertBoundedId(policy.policy_id, 'policy_id');
  assertBoundedId(policy.version, 'version');
  assertSha256(policy.artifact_digest, 'artifact_digest');

  assertExactKeys(policy.implementation, ['kind', 'runtime'], 'implementation');
  literal(policy.implementation.kind, 'external-artifact', 'implementation.kind');
  literal(policy.implementation.runtime, 'not-executed-by-replay-core', 'implementation.runtime');
  literal(policy.interface_version, REPLAY_POLICY_INTERFACE, 'interface_version');
  literal(policy.observation_schema, REPLAY_OBSERVATION_SCHEMA, 'observation_schema');

  if (!Array.isArray(policy.derived_features)) throw new ValidationError('derived_features must be an array');
  let previous = null;
  const seen = new Set();
  for (let index = 0; index < policy.derived_features.length; index += 1) {
    const feature = policy.derived_features[index];
    assertExactKeys(feature, ['feature_id', 'feature_digest'], `derived_features[${index}]`);
    assertBoundedId(feature.feature_id, `derived_features[${index}].feature_id`);
    assertSha256(feature.feature_digest, `derived_features[${index}].feature_digest`);
    if (seen.has(feature.feature_id)) throw new ValidationError('derived_features cannot contain duplicate feature_id values');
    if (previous !== null && feature.feature_id <= previous) {
      throw new ValidationError('derived_features must be strictly ordered by feature_id');
    }
    seen.add(feature.feature_id);
    previous = feature.feature_id;
  }

  assertSafeNonNegativeInteger(policy.max_internal_state_bytes, 'max_internal_state_bytes');
  assertExactKeys(policy.proposer, ['kind', 'ref', 'digest'], 'proposer');
  if (!PROPOSER_KINDS.has(policy.proposer.kind)) throw new ValidationError('proposer.kind is unsupported');
  assertBoundedId(policy.proposer.ref, 'proposer.ref');
  if (policy.proposer.digest !== null) assertSha256(policy.proposer.digest, 'proposer.digest');
  assertCanonicalInstant(policy.created_at, 'created_at');

  literal(policy.authority_effect, 'none', 'authority_effect');
  literal(policy.network_effect, 'none', 'network_effect');
  literal(policy.runtime_activation, false, 'runtime_activation');
  literal(policy.production_promotion, false, 'production_promotion');

  return deepFreezeJson(policy);
}

export function digestExplorationPolicy(input) {
  return digestObject(validateExplorationPolicy(input));
}
