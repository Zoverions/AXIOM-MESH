import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ValidationError } from '../lib/canonical.mjs';

export const EDUCATION_LEARNER_MEMORY_PROFILE_SHA256 =
  '3763a28919d36721467160ef772e30da1d5a536a8733fd88b65f2c60c9107d78';
export const EDUCATION_LEARNER_MEMORY_PROFILE_PATH = fileURLToPath(
  new URL('../../config/domain-contracts/education-learner-memory.v1.json', import.meta.url),
);

const EXPECTED_METADATA_FIELDS = Object.freeze([
  'schema',
  'workflow_id',
  'assignment_id',
  'event_id',
  'event_type',
  'workflow_payload_digest',
]);
const EXPECTED_EVENTS = Object.freeze([
  'appeal.filed',
  'assignment.created',
  'correction.recorded',
  'feedback.recorded',
  'revision.requested',
  'submission.created',
  'submission.resubmitted',
]);

function require(condition, message) {
  if (!condition) throw new ValidationError(`Education learner-memory profile invalid: ${message}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requireExactEventRegistry(value, name) {
  require(value && typeof value === 'object' && !Array.isArray(value), `${name} missing`);
  require(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(EXPECTED_EVENTS),
    `${name} registry mismatch`,
  );
}

function loadPinnedProfile() {
  let raw;
  try {
    raw = readFileSync(EDUCATION_LEARNER_MEMORY_PROFILE_PATH);
  } catch (error) {
    throw new ValidationError(`Education learner-memory profile cannot be read: ${error.message}`);
  }
  require(
    sha256(raw) === EDUCATION_LEARNER_MEMORY_PROFILE_SHA256,
    'cross-repository profile digest drift',
  );
  let profile;
  try {
    profile = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    throw new ValidationError(`Education learner-memory profile invalid JSON: ${error.message}`);
  }
  require(profile?.schema === 'axiom-education-memory-profile.v1', 'schema mismatch');
  require(profile?.profile_id === 'axiom.education.learner-memory', 'profile_id mismatch');
  require(profile?.profile_version === '1.1.0', 'profile_version mismatch');
  require(profile?.memory_action === 'memory.put', 'memory_action mismatch');
  require(profile?.object_id_pattern === '^memory_[a-f0-9]{64}$', 'object_id_pattern mismatch');
  require(
    profile?.metadata_schema === 'axiom-education-governed-memory-ref.v1',
    'metadata_schema mismatch',
  );
  require(
    JSON.stringify(profile?.metadata_fields) === JSON.stringify(EXPECTED_METADATA_FIELDS),
    'metadata_fields mismatch',
  );
  require(
    profile?.invariants?.automatic_tombstone_on_append_failure === false,
    'automatic tombstone must remain disabled',
  );
  require(
    profile?.invariants?.caller_selects_memory_kind === false,
    'caller-selected memory kinds must remain disabled',
  );
  require(profile?.invariants?.content_address_required === true, 'content addressing must remain required');
  require(
    profile?.invariants?.memory_owner_binding_required === true,
    'memory ownership binding must remain required',
  );
  require(
    profile?.invariants?.memory_write_precedes_learner_event_for_new_content === true,
    'memory-before-event ordering changed',
  );
  require(
    profile?.invariants?.raw_content_in_learner_event === false,
    'raw learner content must remain outside learner-event payloads',
  );

  const kindMapping = profile?.event_type_to_memory_kind;
  requireExactEventRegistry(kindMapping, 'event-kind mapping');
  for (const kind of Object.values(kindMapping)) {
    require(
      typeof kind === 'string' && /^education\.[a-z0-9.-]+$/.test(kind),
      'invalid education memory kind',
    );
  }

  const ownerMapping = profile?.event_type_to_memory_owner;
  requireExactEventRegistry(ownerMapping, 'event-owner mapping');
  for (const ownerBinding of Object.values(ownerMapping)) {
    require(ownerBinding === 'actor' || ownerBinding === 'subject', 'invalid memory owner binding');
  }

  return Object.freeze({
    ...profile,
    event_type_to_memory_kind: Object.freeze({ ...kindMapping }),
    event_type_to_memory_owner: Object.freeze({ ...ownerMapping }),
    metadata_fields: EXPECTED_METADATA_FIELDS,
    invariants: Object.freeze({ ...profile.invariants }),
  });
}

export const EDUCATION_LEARNER_MEMORY_PROFILE = loadPinnedProfile();
export const EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_KIND =
  EDUCATION_LEARNER_MEMORY_PROFILE.event_type_to_memory_kind;
export const EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_OWNER =
  EDUCATION_LEARNER_MEMORY_PROFILE.event_type_to_memory_owner;
export const EDUCATION_LEARNER_RECORD_MEMORY_KINDS = Object.freeze(
  [...new Set(Object.values(EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_KIND))].sort(),
);
