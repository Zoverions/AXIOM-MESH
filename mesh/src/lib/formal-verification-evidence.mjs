import {
  assertPlainObject,
  assertString,
  canonicalJson,
  ValidationError
} from './canonical.mjs';
import { researchContractDigest } from './research-capsule-contracts.mjs';

export const FORMAL_VERIFICATION_EVIDENCE_SCHEMA = 'axiom-formal-verification-evidence.v0';

const MAX_OBJECT_BYTES = 65_536;
const MAX_ITEMS = 64;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const TOKEN_PATTERN = /^[a-z][a-z0-9_:-]*$/;

const VERIFICATION_STATES = new Set([
  'freshly_checked',
  'reused',
  'externally_assumed',
  'unknown'
]);
const IMPORT_POLICIES = new Set(['exact', 'substituted', 'defaulted', 'unknown']);
const DIAGNOSTIC_SEVERITIES = new Set(['info', 'warning', 'blocking']);
const PROOF_CHECK_STATES = new Set([
  'passed',
  'failed',
  'checker_error',
  'resource_exhausted',
  'not_run'
]);
const CLOSURE_STATES = new Set(['strict', 'conditional', 'incomplete', 'unknown']);
const SOURCE_ALIGNMENT_STATES = new Set([
  'not_assessed',
  'aligned',
  'partial',
  'contested',
  'mismatch',
  'unknown'
]);
const INDEPENDENCE_STATES = new Set([
  'independent',
  'shared_provenance',
  'same_lineage',
  'unknown'
]);

const EVIDENCE_FIELDS = Object.freeze([
  'schema',
  'evidence_id',
  'target_kind',
  'target_digest',
  'formal_statement_digest',
  'formal_artifact_digest',
  'checker_kind',
  'checker_version',
  'checker_profile_digest',
  'environment_digest',
  'dependency_closure_digest',
  'dependency_statuses',
  'assumptions',
  'import_policy',
  'diagnostics',
  'proof_check_state',
  'closure_state',
  'source_alignment_state',
  'independence_state',
  'checked_at',
  'truth_established',
  'authority_effect',
  'evidence_digest'
]);

const DEPENDENCY_FIELDS = Object.freeze(['dependency_digest', 'verification_state']);
const ASSUMPTION_FIELDS = Object.freeze(['assumption_id', 'statement_digest', 'source_ref']);
const DIAGNOSTIC_FIELDS = Object.freeze(['diagnostic_kind', 'severity', 'message_digest']);

export function formalVerificationEvidenceDigest(value) {
  return researchContractDigest(value, 'evidence_digest');
}

export function verifyFormalVerificationEvidence(value) {
  const object = boundedCanonical(value, 'FormalVerificationEvidence');
  assertExactFields(object, EVIDENCE_FIELDS, 'FormalVerificationEvidence');

  if (object.schema !== FORMAL_VERIFICATION_EVIDENCE_SCHEMA) {
    throw new ValidationError(
      `FormalVerificationEvidence.schema must equal ${FORMAL_VERIFICATION_EVIDENCE_SCHEMA}`
    );
  }

  assertIdentifier(object.evidence_id, 'FormalVerificationEvidence.evidence_id');
  assertToken(object.target_kind, 'FormalVerificationEvidence.target_kind');
  assertDigest(object.target_digest, 'FormalVerificationEvidence.target_digest');
  assertDigest(object.formal_statement_digest, 'FormalVerificationEvidence.formal_statement_digest');
  assertDigest(object.formal_artifact_digest, 'FormalVerificationEvidence.formal_artifact_digest');
  assertToken(object.checker_kind, 'FormalVerificationEvidence.checker_kind');
  assertNonEmptyString(object.checker_version, 'FormalVerificationEvidence.checker_version', 512);
  assertDigest(object.checker_profile_digest, 'FormalVerificationEvidence.checker_profile_digest');
  assertDigest(object.environment_digest, 'FormalVerificationEvidence.environment_digest');
  assertDigest(object.dependency_closure_digest, 'FormalVerificationEvidence.dependency_closure_digest');

  const dependencyStatuses = assertDependencies(object.dependency_statuses);
  const assumptions = assertAssumptions(object.assumptions);
  assertEnum(object.import_policy, IMPORT_POLICIES, 'FormalVerificationEvidence.import_policy');
  const diagnostics = assertDiagnostics(object.diagnostics);
  assertEnum(object.proof_check_state, PROOF_CHECK_STATES, 'FormalVerificationEvidence.proof_check_state');
  assertEnum(object.closure_state, CLOSURE_STATES, 'FormalVerificationEvidence.closure_state');
  assertEnum(
    object.source_alignment_state,
    SOURCE_ALIGNMENT_STATES,
    'FormalVerificationEvidence.source_alignment_state'
  );
  assertEnum(
    object.independence_state,
    INDEPENDENCE_STATES,
    'FormalVerificationEvidence.independence_state'
  );
  assertTimestamp(object.checked_at, 'FormalVerificationEvidence.checked_at');

  if (object.truth_established !== false) {
    throw new ValidationError('FormalVerificationEvidence.truth_established must equal false');
  }
  if (object.authority_effect !== 'none') {
    throw new ValidationError('FormalVerificationEvidence.authority_effect must equal none');
  }

  assertClosureSemantics(object, dependencyStatuses, assumptions, diagnostics);

  assertDigest(object.evidence_digest, 'FormalVerificationEvidence.evidence_digest');
  const expectedDigest = formalVerificationEvidenceDigest(object);
  if (object.evidence_digest !== expectedDigest) {
    throw new ValidationError('FormalVerificationEvidence digest mismatch');
  }

  return object;
}

function assertClosureSemantics(object, dependencyStatuses, assumptions, diagnostics) {
  const passed = object.proof_check_state === 'passed';
  const hasBlockingDiagnostic = diagnostics.some(item => item.severity === 'blocking');
  const hasWarning = diagnostics.some(item => item.severity === 'warning');
  const hasNonFreshDependency = dependencyStatuses.some(
    item => item.verification_state !== 'freshly_checked'
  );

  if (!passed && (object.closure_state === 'strict' || object.closure_state === 'conditional')) {
    throw new ValidationError(
      'FormalVerificationEvidence non-passing proof cannot claim strict or conditional closure'
    );
  }

  if (hasBlockingDiagnostic && object.closure_state !== 'incomplete') {
    throw new ValidationError(
      'FormalVerificationEvidence blocking diagnostics require incomplete closure'
    );
  }

  if (object.closure_state === 'strict') {
    if (!passed) {
      throw new ValidationError('FormalVerificationEvidence strict closure requires a passing proof');
    }
    if (assumptions.length !== 0) {
      throw new ValidationError('FormalVerificationEvidence strict closure cannot contain assumptions');
    }
    if (hasNonFreshDependency) {
      throw new ValidationError(
        'FormalVerificationEvidence strict closure requires freshly checked dependencies'
      );
    }
    if (object.import_policy !== 'exact') {
      throw new ValidationError('FormalVerificationEvidence strict closure requires exact imports');
    }
    if (hasWarning || hasBlockingDiagnostic) {
      throw new ValidationError(
        'FormalVerificationEvidence strict closure cannot contain warning or blocking diagnostics'
      );
    }
  }

  if (object.closure_state === 'conditional') {
    if (!passed) {
      throw new ValidationError('FormalVerificationEvidence conditional closure requires a passing proof');
    }
    if (hasBlockingDiagnostic) {
      throw new ValidationError(
        'FormalVerificationEvidence conditional closure cannot contain blocking diagnostics'
      );
    }
  }
}

function assertDependencies(value) {
  assertArray(value, 'FormalVerificationEvidence.dependency_statuses');
  if (value.length > MAX_ITEMS) {
    throw new ValidationError(
      `FormalVerificationEvidence.dependency_statuses must contain at most ${MAX_ITEMS} items`
    );
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const name = `FormalVerificationEvidence.dependency_statuses[${index}]`;
    assertPlainObject(item, name);
    assertExactFields(item, DEPENDENCY_FIELDS, name);
    assertDigest(item.dependency_digest, `${name}.dependency_digest`);
    assertEnum(item.verification_state, VERIFICATION_STATES, `${name}.verification_state`);
    if (seen.has(item.dependency_digest)) {
      throw new ValidationError('FormalVerificationEvidence dependency digests must be unique');
    }
    seen.add(item.dependency_digest);
  }
  return value;
}

function assertAssumptions(value) {
  assertArray(value, 'FormalVerificationEvidence.assumptions');
  if (value.length > MAX_ITEMS) {
    throw new ValidationError(
      `FormalVerificationEvidence.assumptions must contain at most ${MAX_ITEMS} items`
    );
  }
  const ids = new Set();
  const digests = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const name = `FormalVerificationEvidence.assumptions[${index}]`;
    assertPlainObject(item, name);
    assertExactFields(item, ASSUMPTION_FIELDS, name);
    assertIdentifier(item.assumption_id, `${name}.assumption_id`);
    assertDigest(item.statement_digest, `${name}.statement_digest`);
    assertNonEmptyString(item.source_ref, `${name}.source_ref`, 2048);
    if (ids.has(item.assumption_id)) {
      throw new ValidationError('FormalVerificationEvidence assumption IDs must be unique');
    }
    if (digests.has(item.statement_digest)) {
      throw new ValidationError('FormalVerificationEvidence assumption digests must be unique');
    }
    ids.add(item.assumption_id);
    digests.add(item.statement_digest);
  }
  return value;
}

function assertDiagnostics(value) {
  assertArray(value, 'FormalVerificationEvidence.diagnostics');
  if (value.length > MAX_ITEMS) {
    throw new ValidationError(
      `FormalVerificationEvidence.diagnostics must contain at most ${MAX_ITEMS} items`
    );
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const name = `FormalVerificationEvidence.diagnostics[${index}]`;
    assertPlainObject(item, name);
    assertExactFields(item, DIAGNOSTIC_FIELDS, name);
    assertToken(item.diagnostic_kind, `${name}.diagnostic_kind`);
    assertEnum(item.severity, DIAGNOSTIC_SEVERITIES, `${name}.severity`);
    assertDigest(item.message_digest, `${name}.message_digest`);
    const key = `${item.diagnostic_kind}|${item.severity}|${item.message_digest}`;
    if (seen.has(key)) {
      throw new ValidationError('FormalVerificationEvidence diagnostics must be unique');
    }
    seen.add(key);
  }
  return value;
}

function boundedCanonical(value, name) {
  assertPlainObject(value, name);
  const encoded = canonicalJson(value);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_OBJECT_BYTES) {
    throw new ValidationError(`${name} exceeds ${MAX_OBJECT_BYTES} bytes`);
  }
  return JSON.parse(encoded);
}

function assertArray(value, name) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${name} must be an array`);
  }
}

function assertExactFields(object, fields, name) {
  const allowed = new Set(fields);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${name} contains unsupported field: ${key}`);
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(object, key)) {
      throw new ValidationError(`${name} is missing field: ${key}`);
    }
  }
}

function assertIdentifier(value, name) {
  assertString(value, name, { max: 512 });
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new ValidationError(`${name} has invalid identifier syntax`);
  }
}

function assertToken(value, name) {
  assertString(value, name, { max: 128 });
  if (!TOKEN_PATTERN.test(value)) {
    throw new ValidationError(`${name} has invalid token syntax`);
  }
}

function assertDigest(value, name) {
  assertString(value, name, { max: 71 });
  if (!DIGEST_PATTERN.test(value)) {
    throw new ValidationError(`${name} must be a sha256 digest`);
  }
}

function assertNonEmptyString(value, name, max) {
  assertString(value, name, { max });
  if (value.length === 0) {
    throw new ValidationError(`${name} must not be empty`);
  }
}

function assertEnum(value, allowed, name) {
  assertString(value, name, { max: 128 });
  if (!allowed.has(value)) {
    throw new ValidationError(`${name} is not an allowed value`);
  }
}

function assertTimestamp(value, name) {
  assertString(value, name, { max: 64 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical UTC ISO-8601 timestamp`);
  }
}
