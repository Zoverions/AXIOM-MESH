import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  canonicalJson,
  digestObject
} from './canonical.mjs';

export const CANONICAL_SHARED_ARTIFACT_SCHEMA = 'axiom-canonical-shared-artifact.v0';

const VERSION = 0;
const STATUS = 'inert-shared-artifact-contract';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTENT_TYPES = new Set(['text/plain', 'application/json']);
const OPERATIONS = new Set(['put', 'retract', 'resolve']);
const ACTOR_KINDS = new Set(['human', 'agent', 'service']);
const AUTHORITY_DOMAIN_KINDS = new Set(['owner', 'circle']);
const STATES = new Set(['active', 'conflict', 'retracted']);
const SHARING_STATES = new Set(['private', 'projected']);

const TOP_LEVEL_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'artifact_id',
  'owner_ref',
  'authority_domain',
  'content_type',
  'revisions',
  'current_heads',
  'state',
  'current_content_digest',
  'sharing',
  'created_at',
  'updated_at',
  'authority_effect',
  'network_effect',
  'runtime_activation'
]);

const AUTHORITY_DOMAIN_FIELDS = Object.freeze(['kind', 'ref']);
const SHARING_FIELDS = Object.freeze(['state', 'projection_refs']);
const REVISION_FIELDS = Object.freeze([
  'revision_id',
  'parents',
  'operation',
  'actor_principal',
  'actor_kind',
  'authorization',
  'payload',
  'content_digest',
  'resolves',
  'work_graph',
  'occurred_at'
]);
const AUTHORIZATION_FIELDS = Object.freeze([
  'request_digest',
  'evidence_ref',
  'evidence_digest'
]);
const WORK_GRAPH_FIELDS = Object.freeze(['graph_id', 'graph_digest']);

function assertExactFields(value, fields, name) {
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} contains unknown field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${name}.${key} is required`);
  }
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function identifier(value, name) {
  return assertString(value, name, { max: 160, pattern: IDENTIFIER });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function canonicalTimestamp(value, name) {
  assertString(value, name, { min: 24, max: 24, pattern: CANONICAL_TIMESTAMP });
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical UTC timestamp`);
  }
  return value;
}

function exactSortedIdentifiers(value, name, { minItems = 0, maxItems = 32 } = {}) {
  const items = assertStringArray(value, name, { maxItems, itemMax: 160 });
  if (items.length < minItems) {
    throw new ValidationError(`${name} must contain at least ${minItems} item${minItems === 1 ? '' : 's'}`);
  }
  for (let index = 0; index < items.length; index += 1) {
    identifier(items[index], `${name}[${index}]`);
  }
  if (new Set(items).size !== items.length) throw new ValidationError(`${name} contains duplicate identifiers`);
  const sorted = [...items].sort(compareCodeUnits);
  if (items.some((item, index) => item !== sorted[index])) {
    throw new ValidationError(`${name} must be sorted in code-unit order`);
  }
  return Object.freeze([...items]);
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function validateAuthorityDomain(input, ownerRef) {
  const value = assertPlainObject(input, 'canonical shared artifact.authority_domain');
  assertExactFields(value, AUTHORITY_DOMAIN_FIELDS, 'canonical shared artifact.authority_domain');
  const kind = assertString(value.kind, 'canonical shared artifact.authority_domain.kind', { max: 16 });
  if (!AUTHORITY_DOMAIN_KINDS.has(kind)) {
    throw new ValidationError('canonical shared artifact authority domain kind is unsupported');
  }
  const ref = identifier(value.ref, 'canonical shared artifact.authority_domain.ref');
  if (kind === 'owner' && ref !== ownerRef) {
    throw new ValidationError('canonical shared artifact owner authority domain must match owner_ref');
  }
  return Object.freeze({ kind, ref });
}

function validateSharing(input) {
  const value = assertPlainObject(input, 'canonical shared artifact.sharing');
  assertExactFields(value, SHARING_FIELDS, 'canonical shared artifact.sharing');
  const state = assertString(value.state, 'canonical shared artifact.sharing.state', { max: 16 });
  if (!SHARING_STATES.has(state)) throw new ValidationError('canonical shared artifact sharing state is unsupported');
  const projectionRefs = exactSortedIdentifiers(
    value.projection_refs,
    'canonical shared artifact.sharing.projection_refs',
    { maxItems: 64 }
  );
  if (state === 'private' && projectionRefs.length !== 0) {
    throw new ValidationError('canonical shared artifact private sharing cannot contain projection references');
  }
  if (state === 'projected' && projectionRefs.length === 0) {
    throw new ValidationError('canonical shared artifact projected sharing requires projection references');
  }
  return Object.freeze({ state, projection_refs: projectionRefs });
}

function validateAuthorization(input, revisionName) {
  const name = `${revisionName}.authorization`;
  const value = assertPlainObject(input, name);
  assertExactFields(value, AUTHORIZATION_FIELDS, name);
  return Object.freeze({
    request_digest: digest(value.request_digest, `${name}.request_digest`),
    evidence_ref: identifier(value.evidence_ref, `${name}.evidence_ref`),
    evidence_digest: digest(value.evidence_digest, `${name}.evidence_digest`)
  });
}

function validateWorkGraph(input, revisionName) {
  if (input === null) return null;
  const name = `${revisionName}.work_graph`;
  const value = assertPlainObject(input, name);
  assertExactFields(value, WORK_GRAPH_FIELDS, name);
  return Object.freeze({
    graph_id: identifier(value.graph_id, `${name}.graph_id`),
    graph_digest: digest(value.graph_digest, `${name}.graph_digest`)
  });
}

function validatePayload(payload, contentType, name) {
  if (payload === null) throw new ValidationError(`${name} non-retraction revision requires content`);
  if (contentType === 'text/plain') {
    if (typeof payload !== 'string') throw new ValidationError(`${name} text payload must be a string`);
    if (payload.length > 65_536) throw new ValidationError(`${name} text payload exceeds 65536 characters`);
    return payload;
  }
  let encoded;
  try {
    encoded = canonicalJson(payload);
  } catch (error) {
    throw new ValidationError(`${name} structured payload must be canonical JSON data`, { cause: error?.message });
  }
  if (Buffer.byteLength(encoded, 'utf8') > 65_536) {
    throw new ValidationError(`${name} structured payload exceeds 65536 UTF-8 bytes`);
  }
  return payload;
}

function validateRevision(input, index, contentType) {
  const name = `canonical shared artifact.revisions[${index}]`;
  const value = assertPlainObject(input, name);
  assertExactFields(value, REVISION_FIELDS, name);

  const operation = assertString(value.operation, `${name}.operation`, { max: 16 });
  if (!OPERATIONS.has(operation)) throw new ValidationError(`${name} operation is unsupported`);
  const actorKind = assertString(value.actor_kind, `${name}.actor_kind`, { max: 16 });
  if (!ACTOR_KINDS.has(actorKind)) throw new ValidationError(`${name} actor kind is unsupported`);

  const parents = exactSortedIdentifiers(value.parents, `${name}.parents`, { maxItems: 32 });
  const resolves = exactSortedIdentifiers(value.resolves, `${name}.resolves`, { maxItems: 32 });

  let payload = value.payload;
  let contentDigest = value.content_digest;
  if (operation === 'retract') {
    if (payload !== null || contentDigest !== null) {
      throw new ValidationError(`${name} retraction must be a contentless tombstone`);
    }
  } else {
    payload = validatePayload(payload, contentType, name);
    contentDigest = digest(contentDigest, `${name}.content_digest`);
    const expected = digestObject({ content_type: contentType, payload });
    if (contentDigest !== expected) throw new ValidationError(`${name} content digest does not match canonical payload`);
  }

  return Object.freeze({
    revision_id: identifier(value.revision_id, `${name}.revision_id`),
    parents,
    operation,
    actor_principal: identifier(value.actor_principal, `${name}.actor_principal`),
    actor_kind: actorKind,
    authorization: validateAuthorization(value.authorization, name),
    payload,
    content_digest: contentDigest,
    resolves,
    work_graph: validateWorkGraph(value.work_graph, name),
    occurred_at: canonicalTimestamp(value.occurred_at, `${name}.occurred_at`)
  });
}

function deriveHistory(revisions) {
  const seen = new Set();
  const heads = new Set();
  let previousTimestamp = null;

  for (let index = 0; index < revisions.length; index += 1) {
    const revision = revisions[index];
    if (seen.has(revision.revision_id)) {
      throw new ValidationError(`canonical shared artifact contains duplicate revision ${revision.revision_id}`);
    }
    for (const parent of revision.parents) {
      if (parent === revision.revision_id) {
        throw new ValidationError(`canonical shared artifact revision ${revision.revision_id} cannot parent itself`);
      }
      if (!seen.has(parent)) {
        throw new ValidationError(`canonical shared artifact revision ${revision.revision_id} parent ${parent} must reference an earlier revision`);
      }
    }

    const timestamp = Date.parse(revision.occurred_at);
    if (previousTimestamp !== null && timestamp < previousTimestamp) {
      throw new ValidationError('canonical shared artifact revision timestamps must be monotonic');
    }
    previousTimestamp = timestamp;

    if (index === 0) {
      if (revision.operation !== 'put' || revision.parents.length !== 0 || revision.resolves.length !== 0) {
        throw new ValidationError('canonical shared artifact first revision must be put with no parents or resolutions');
      }
      heads.add(revision.revision_id);
      seen.add(revision.revision_id);
      continue;
    }

    if (revision.operation === 'resolve') {
      const expectedHeads = [...heads].sort(compareCodeUnits);
      if (expectedHeads.length < 2) {
        throw new ValidationError('canonical shared artifact resolution requires at least two current heads');
      }
      if (!arraysEqual(revision.parents, expectedHeads) || !arraysEqual(revision.resolves, expectedHeads)) {
        throw new ValidationError('canonical shared artifact resolution must name every current head exactly');
      }
      heads.clear();
      heads.add(revision.revision_id);
    } else {
      if (revision.parents.length !== 1) {
        throw new ValidationError(`canonical shared artifact ${revision.operation} revision requires exactly one parent`);
      }
      if (revision.resolves.length !== 0) {
        throw new ValidationError(`canonical shared artifact ${revision.operation} revision cannot declare resolutions`);
      }
      heads.delete(revision.parents[0]);
      heads.add(revision.revision_id);
    }
    seen.add(revision.revision_id);
  }

  return Object.freeze([...heads].sort(compareCodeUnits));
}

export function validateCanonicalSharedArtifact(input) {
  const value = assertPlainObject(input, 'canonical shared artifact');
  assertExactFields(value, TOP_LEVEL_FIELDS, 'canonical shared artifact');

  if (value.schema !== CANONICAL_SHARED_ARTIFACT_SCHEMA) {
    throw new ValidationError('canonical shared artifact.schema is unsupported');
  }
  if (value.version !== VERSION) throw new ValidationError(`canonical shared artifact.version must be ${VERSION}`);
  if (value.status !== STATUS) throw new ValidationError(`canonical shared artifact.status must be ${STATUS}`);
  if (value.authority_effect !== 'none') throw new ValidationError('canonical shared artifact authority effect must be none');
  if (value.network_effect !== 'none') throw new ValidationError('canonical shared artifact network effect must be none');
  if (value.runtime_activation !== false) throw new ValidationError('canonical shared artifact runtime activation must be false');

  const artifactId = identifier(value.artifact_id, 'canonical shared artifact.artifact_id');
  const ownerRef = identifier(value.owner_ref, 'canonical shared artifact.owner_ref');
  const authorityDomain = validateAuthorityDomain(value.authority_domain, ownerRef);
  const contentType = assertString(value.content_type, 'canonical shared artifact.content_type', { max: 64 });
  if (!CONTENT_TYPES.has(contentType)) throw new ValidationError('canonical shared artifact content type is unsupported');

  if (!Array.isArray(value.revisions) || value.revisions.length < 1 || value.revisions.length > 256) {
    throw new ValidationError('canonical shared artifact.revisions must contain 1-256 revisions');
  }
  const revisions = value.revisions.map((revision, index) => validateRevision(revision, index, contentType));
  const derivedHeads = deriveHistory(revisions);
  const declaredHeads = exactSortedIdentifiers(
    value.current_heads,
    'canonical shared artifact.current_heads',
    { minItems: 1, maxItems: 32 }
  );
  if (!arraysEqual(declaredHeads, derivedHeads)) {
    throw new ValidationError('canonical shared artifact current heads do not match derived causal heads');
  }

  const state = assertString(value.state, 'canonical shared artifact.state', { max: 16 });
  if (!STATES.has(state)) throw new ValidationError('canonical shared artifact state is unsupported');

  const byId = new Map(revisions.map(revision => [revision.revision_id, revision]));
  let derivedState;
  let derivedCurrentDigest;
  if (derivedHeads.length > 1) {
    derivedState = 'conflict';
    derivedCurrentDigest = null;
  } else {
    const head = byId.get(derivedHeads[0]);
    if (head.operation === 'retract') {
      derivedState = 'retracted';
      derivedCurrentDigest = null;
    } else {
      derivedState = 'active';
      derivedCurrentDigest = head.content_digest;
    }
  }
  if (state !== derivedState) {
    throw new ValidationError(`canonical shared artifact state must match derived state ${derivedState}`);
  }

  let declaredCurrentDigest = value.current_content_digest;
  if (declaredCurrentDigest !== null) {
    declaredCurrentDigest = digest(declaredCurrentDigest, 'canonical shared artifact.current_content_digest');
  }
  if (declaredCurrentDigest !== derivedCurrentDigest) {
    throw new ValidationError('canonical shared artifact current content digest does not match derived head state');
  }

  const createdAt = canonicalTimestamp(value.created_at, 'canonical shared artifact.created_at');
  const updatedAt = canonicalTimestamp(value.updated_at, 'canonical shared artifact.updated_at');
  if (createdAt !== revisions[0].occurred_at) {
    throw new ValidationError('canonical shared artifact created_at must equal the first revision timestamp');
  }
  if (updatedAt !== revisions[revisions.length - 1].occurred_at) {
    throw new ValidationError('canonical shared artifact updated_at must equal the last revision timestamp');
  }

  validateSharing(value.sharing);

  let artifactDigest;
  try {
    artifactDigest = digestObject(value);
  } catch (error) {
    throw new ValidationError('canonical shared artifact must be canonical JSON data', { cause: error?.message });
  }

  return Object.freeze({
    valid: true,
    schema: CANONICAL_SHARED_ARTIFACT_SCHEMA,
    artifact_id: artifactId,
    owner_ref: ownerRef,
    authority_domain: authorityDomain,
    state: derivedState,
    current_heads: Object.freeze([...derivedHeads]),
    current_content_digest: derivedCurrentDigest,
    revision_count: revisions.length,
    artifact_digest: artifactDigest,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function canonicalSharedArtifactDigest(document) {
  validateCanonicalSharedArtifact(document);
  return digestObject(document);
}
