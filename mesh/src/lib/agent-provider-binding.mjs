import {
  assertPlainObject,
  assertString,
  digestObject,
  ValidationError
} from './canonical.mjs';
import {
  agentCompositionDigest,
  validateAgentComposition
} from './agent-composition.mjs';
import {
  agentProviderProfileDigest,
  validateAgentProviderProfile
} from './agent-provider-profile.mjs';

export const AGENT_PROVIDER_BINDING_SCHEMA = 'axiom-agent-provider-binding.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PROVIDER_CLASSES = Object.freeze([
  'memory',
  'knowledge-projection',
  'agent-interop',
  'attestation',
  'provenance',
  'settlement'
]);
const TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'version',
  'status',
  'binding_id',
  'composition_id',
  'composition_digest',
  'bindings',
  'created_at',
  'updated_at',
  'authority_effect',
  'trust_effect',
  'network_effect',
  'runtime_activation',
  'settlement_activation'
]);
const BINDING_KEYS = Object.freeze([
  'provider_id',
  'provider_class',
  'profile_ref',
  'provider_digest',
  'target_ref',
  'required'
]);

function assertExactKeys(value, allowed, name) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new ValidationError(`${name} contains unknown field: ${key}`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${name} is missing required field: ${key}`);
    }
  }
}

function assertIdentifier(value, name) {
  return assertString(value, name, { min: 1, max: 160, pattern: IDENTIFIER });
}

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function assertTimestamp(value, name) {
  assertString(value, name, { min: 20, max: 35 });
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical ISO-8601 instant`);
  }
  return instant;
}

function assertProviderClass(value, name) {
  if (!PROVIDER_CLASSES.includes(value)) {
    throw new ValidationError(`${name} is not a supported provider class`);
  }
  return value;
}

function validateBindingEntry(entry, index) {
  assertPlainObject(entry, `bindings[${index}]`);
  assertExactKeys(entry, BINDING_KEYS, `bindings[${index}]`);
  assertIdentifier(entry.provider_id, `bindings[${index}].provider_id`);
  assertProviderClass(entry.provider_class, `bindings[${index}].provider_class`);
  assertIdentifier(entry.profile_ref, `bindings[${index}].profile_ref`);
  assertDigest(entry.provider_digest, `bindings[${index}].provider_digest`);
  assertIdentifier(entry.target_ref, `bindings[${index}].target_ref`);
  if (typeof entry.required !== 'boolean') {
    throw new ValidationError(`bindings[${index}].required must be a boolean`);
  }
  return entry;
}

export function validateAgentProviderBinding(document) {
  assertPlainObject(document, 'agent provider binding');
  assertExactKeys(document, TOP_LEVEL_KEYS, 'agent provider binding');

  if (document.schema !== AGENT_PROVIDER_BINDING_SCHEMA) {
    throw new ValidationError('agent provider binding schema is unsupported');
  }
  if (document.version !== 0) {
    throw new ValidationError('agent provider binding version must be 0');
  }
  if (document.status !== 'inert-binding-laboratory') {
    throw new ValidationError('agent provider binding status is unsupported');
  }

  assertIdentifier(document.binding_id, 'binding_id');
  assertIdentifier(document.composition_id, 'composition_id');
  assertDigest(document.composition_digest, 'composition_digest');

  if (!Array.isArray(document.bindings) || document.bindings.length < 1 || document.bindings.length > 64) {
    throw new ValidationError('bindings must contain 1-64 items');
  }
  const seen = new Set();
  for (let index = 0; index < document.bindings.length; index += 1) {
    const entry = validateBindingEntry(document.bindings[index], index);
    const identity = `${entry.provider_id}\0${entry.profile_ref}\0${entry.target_ref}`;
    if (seen.has(identity)) {
      throw new ValidationError('agent provider binding contains duplicate bindings');
    }
    seen.add(identity);
  }

  const created = assertTimestamp(document.created_at, 'created_at');
  const updated = assertTimestamp(document.updated_at, 'updated_at');
  if (updated < created) {
    throw new ValidationError('updated_at cannot precede created_at');
  }

  if (
    document.authority_effect !== 'none'
    || document.trust_effect !== 'evidence-only'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
    || document.settlement_activation !== false
  ) {
    throw new ValidationError('agent provider binding boundary cannot widen authority, trust, network, runtime, or settlement effects');
  }

  return document;
}

export function agentProviderBindingDigest(document) {
  validateAgentProviderBinding(document);
  return digestObject(document);
}

function profileIdentity(providerId, profileRef) {
  return `${providerId}\0${profileRef}`;
}

function normalizeProviderProfiles(providerProfiles) {
  if (!Array.isArray(providerProfiles) || providerProfiles.length > 64) {
    throw new ValidationError('provider profiles must be an array with at most 64 items');
  }
  const profiles = new Map();
  for (const profile of providerProfiles) {
    validateAgentProviderProfile(profile);
    const key = profileIdentity(profile.provider_id, profile.profile_ref);
    if (profiles.has(key)) {
      throw new ValidationError('provider profiles contain a duplicate provider profile');
    }
    profiles.set(key, profile);
  }
  return profiles;
}

export function resolveAgentProviderBinding(document, composition, providerProfiles) {
  validateAgentProviderBinding(document);
  validateAgentComposition(composition);

  if (document.composition_id !== composition.composition_id) {
    throw new ValidationError('agent provider binding composition_id does not match the composition');
  }
  const actualCompositionDigest = agentCompositionDigest(composition);
  if (document.composition_digest !== actualCompositionDigest) {
    throw new ValidationError('agent provider binding composition digest does not match the composition');
  }

  const profiles = normalizeProviderProfiles(providerProfiles);
  const boundMemoryIds = new Set();
  const providerClasses = [];

  for (const binding of document.bindings) {
    const profile = profiles.get(profileIdentity(binding.provider_id, binding.profile_ref));
    if (!profile) {
      throw new ValidationError(`provider profile is unavailable for ${binding.provider_id}`);
    }
    if (profile.provider_class !== binding.provider_class) {
      throw new ValidationError(`provider profile class does not match binding for ${binding.provider_id}`);
    }
    const actualProviderDigest = agentProviderProfileDigest(profile);
    if (binding.provider_digest !== actualProviderDigest) {
      throw new ValidationError(`provider digest does not match provider profile for ${binding.provider_id}`);
    }

    if (binding.provider_class === 'memory') {
      const memory = composition.memories.find(item => item.memory_id === binding.target_ref);
      if (
        !memory
        || memory.provider_id !== binding.provider_id
        || memory.profile_ref !== binding.profile_ref
      ) {
        throw new ValidationError(`memory target does not match composition memory for ${binding.provider_id}`);
      }
      if (boundMemoryIds.has(memory.memory_id)) {
        throw new ValidationError(`memory target is bound more than once: ${memory.memory_id}`);
      }
      boundMemoryIds.add(memory.memory_id);
    } else if (binding.target_ref !== composition.composition_id) {
      throw new ValidationError(`composition target must equal ${composition.composition_id} for ${binding.provider_id}`);
    }

    providerClasses.push(binding.provider_class);
  }

  for (const memory of composition.memories) {
    if (!boundMemoryIds.has(memory.memory_id)) {
      throw new ValidationError(`unbound composition memory: ${memory.memory_id}`);
    }
  }

  const classes = Object.freeze([...new Set(providerClasses)].sort());
  return Object.freeze({
    valid: true,
    schema: document.schema,
    version: document.version,
    binding_id: document.binding_id,
    composition_id: document.composition_id,
    composition_digest: document.composition_digest,
    providers: document.bindings.length,
    provider_classes: classes,
    binding_digest: agentProviderBindingDigest(document),
    authority_effect: 'none',
    trust_effect: 'evidence-only',
    network_effect: 'none',
    runtime_activation: false,
    settlement_activation: false
  });
}
