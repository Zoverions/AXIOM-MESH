import {
  assertPlainObject,
  assertString,
  canonicalJson,
  ValidationError
} from './canonical.mjs';
import { researchContractDigest } from './research-capsule-contracts.mjs';

export const RESEARCH_CONTRIBUTION_SCHEMA = 'axiom-research-contribution.v0';
export const RESEARCH_RELATION_SCHEMA = 'axiom-research-relation.v0';

const MAX_OBJECT_BYTES = 65_536;
const MAX_CONTRIBUTIONS = 1_024;
const MAX_RELATIONS = 4_096;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

const CONTRIBUTION_KINDS = new Set([
  'hypothesis',
  'experiment',
  'result',
  'verification',
  'negative_result',
  'synthesis'
]);

const RELATION_PREDICATES = new Set([
  'builds_on',
  'derived_from',
  'reproduces',
  'failed_to_reproduce',
  'supports',
  'contradicts',
  'supersedes'
]);

const LINEAGE_PREDICATES = new Set([
  'builds_on',
  'derived_from',
  'reproduces',
  'failed_to_reproduce',
  'supersedes'
]);

const INDEPENDENCE_STATES = new Set([
  'independent',
  'shared_provenance',
  'same_lineage',
  'unknown'
]);

const CONTRIBUTION_FIELDS = Object.freeze([
  'schema',
  'contribution_id',
  'contribution_kind',
  'created_at',
  'contributor_ref',
  'artifact_refs',
  'evidence_refs',
  'summary',
  'truth_established',
  'authority_effect',
  'contribution_digest'
]);

const RELATION_FIELDS = Object.freeze([
  'schema',
  'relation_id',
  'subject_contribution_digest',
  'predicate',
  'object_contribution_digest',
  'independence_state',
  'evidence_refs',
  'authority_effect',
  'relation_digest'
]);

export function verifyResearchContribution(value) {
  const object = boundedCanonical(value, 'ResearchContribution');
  assertExactFields(object, CONTRIBUTION_FIELDS, 'ResearchContribution');
  assertSchema(object.schema, RESEARCH_CONTRIBUTION_SCHEMA, 'ResearchContribution');
  assertIdentifier(object.contribution_id, 'ResearchContribution.contribution_id');
  assertEnum(
    object.contribution_kind,
    CONTRIBUTION_KINDS,
    'ResearchContribution.contribution_kind'
  );
  assertTimestamp(object.created_at, 'ResearchContribution.created_at');
  assertNonEmptyString(object.contributor_ref, 'ResearchContribution.contributor_ref', 2048);
  assertUniqueStrings(object.artifact_refs, 'ResearchContribution.artifact_refs');
  assertUniqueStrings(object.evidence_refs, 'ResearchContribution.evidence_refs');
  assertNonEmptyString(object.summary, 'ResearchContribution.summary', 8192);
  if (object.truth_established !== false) {
    throw new ValidationError('ResearchContribution.truth_established must equal false');
  }
  if (object.authority_effect !== 'none') {
    throw new ValidationError('ResearchContribution.authority_effect must equal none');
  }
  assertDigest(object.contribution_digest, 'ResearchContribution.contribution_digest');
  assertSelfDigest(object, 'contribution_digest', 'ResearchContribution');
  return object;
}

export function verifyResearchRelation(value) {
  const object = boundedCanonical(value, 'ResearchRelation');
  assertExactFields(object, RELATION_FIELDS, 'ResearchRelation');
  assertSchema(object.schema, RESEARCH_RELATION_SCHEMA, 'ResearchRelation');
  assertIdentifier(object.relation_id, 'ResearchRelation.relation_id');
  assertDigest(
    object.subject_contribution_digest,
    'ResearchRelation.subject_contribution_digest'
  );
  assertEnum(object.predicate, RELATION_PREDICATES, 'ResearchRelation.predicate');
  assertDigest(
    object.object_contribution_digest,
    'ResearchRelation.object_contribution_digest'
  );
  assertEnum(
    object.independence_state,
    INDEPENDENCE_STATES,
    'ResearchRelation.independence_state'
  );
  assertUniqueStrings(object.evidence_refs, 'ResearchRelation.evidence_refs');
  if (object.authority_effect !== 'none') {
    throw new ValidationError('ResearchRelation.authority_effect must equal none');
  }
  assertDigest(object.relation_digest, 'ResearchRelation.relation_digest');
  assertSelfDigest(object, 'relation_digest', 'ResearchRelation');
  return object;
}

export function buildResearchCompositionGraph(value) {
  assertPlainObject(value, 'ResearchCompositionGraph input');
  assertExactFields(
    value,
    ['contributions', 'relations'],
    'ResearchCompositionGraph input'
  );

  if (!Array.isArray(value.contributions)) {
    throw new ValidationError('ResearchCompositionGraph contributions must be an array');
  }
  if (value.contributions.length < 1 || value.contributions.length > MAX_CONTRIBUTIONS) {
    throw new ValidationError(
      `ResearchCompositionGraph contributions must contain between 1 and ${MAX_CONTRIBUTIONS} items`
    );
  }
  if (!Array.isArray(value.relations)) {
    throw new ValidationError('ResearchCompositionGraph relations must be an array');
  }
  if (value.relations.length > MAX_RELATIONS) {
    throw new ValidationError(
      `ResearchCompositionGraph relations must contain at most ${MAX_RELATIONS} items`
    );
  }

  const contributions = value.contributions.map(verifyResearchContribution);
  const relations = value.relations.map(verifyResearchRelation);
  const byDigest = new Map();
  const contributionIds = new Set();

  for (const contribution of contributions) {
    if (contributionIds.has(contribution.contribution_id)) {
      throw new ValidationError(
        `ResearchCompositionGraph duplicate contribution ID: ${contribution.contribution_id}`
      );
    }
    if (byDigest.has(contribution.contribution_digest)) {
      throw new ValidationError(
        `ResearchCompositionGraph duplicate contribution digest: ${contribution.contribution_digest}`
      );
    }
    contributionIds.add(contribution.contribution_id);
    byDigest.set(contribution.contribution_digest, contribution);
  }

  const relationIds = new Set();
  const relationDigests = new Set();
  const relationTuples = new Set();

  for (const relation of relations) {
    if (relationIds.has(relation.relation_id)) {
      throw new ValidationError(
        `ResearchCompositionGraph duplicate relation ID: ${relation.relation_id}`
      );
    }
    if (relationDigests.has(relation.relation_digest)) {
      throw new ValidationError(
        `ResearchCompositionGraph duplicate relation digest: ${relation.relation_digest}`
      );
    }
    relationIds.add(relation.relation_id);
    relationDigests.add(relation.relation_digest);

    if (!byDigest.has(relation.subject_contribution_digest)) {
      throw new ValidationError(
        `ResearchCompositionGraph relation references unknown contribution: ${relation.subject_contribution_digest}`
      );
    }
    if (!byDigest.has(relation.object_contribution_digest)) {
      throw new ValidationError(
        `ResearchCompositionGraph relation references unknown contribution: ${relation.object_contribution_digest}`
      );
    }
    if (relation.subject_contribution_digest === relation.object_contribution_digest) {
      throw new ValidationError(
        `ResearchCompositionGraph self relation is not allowed: ${relation.relation_id}`
      );
    }

    const tuple = [
      relation.subject_contribution_digest,
      relation.predicate,
      relation.object_contribution_digest
    ].join('|');
    if (relationTuples.has(tuple)) {
      throw new ValidationError(
        `ResearchCompositionGraph duplicate relation: ${tuple}`
      );
    }
    relationTuples.add(tuple);
  }

  const parentsBySubject = new Map();
  const lineageObjects = new Set();

  for (const relation of relations) {
    if (!LINEAGE_PREDICATES.has(relation.predicate)) continue;
    const parents = parentsBySubject.get(relation.subject_contribution_digest) ?? [];
    parents.push(relation.object_contribution_digest);
    parentsBySubject.set(relation.subject_contribution_digest, parents);
    lineageObjects.add(relation.object_contribution_digest);
  }

  assertAcyclicLineage(byDigest.keys(), parentsBySubject);

  const roots = [...byDigest.keys()]
    .filter(digest => (parentsBySubject.get(digest) ?? []).length === 0)
    .sort();

  const frontier = [...byDigest.keys()]
    .filter(digest => !lineageObjects.has(digest))
    .sort();

  const depthMemo = new Map();
  const depthOf = digest => {
    if (depthMemo.has(digest)) return depthMemo.get(digest);
    const parents = parentsBySubject.get(digest) ?? [];
    const depth = parents.length === 0
      ? 0
      : 1 + Math.max(...parents.map(depthOf));
    depthMemo.set(digest, depth);
    return depth;
  };

  let maxLineageDepth = 0;
  for (const digest of byDigest.keys()) {
    maxLineageDepth = Math.max(maxLineageDepth, depthOf(digest));
  }

  const rootMemo = new Map();
  const rootsFor = digest => {
    if (rootMemo.has(digest)) return rootMemo.get(digest);
    const parents = parentsBySubject.get(digest) ?? [];
    if (parents.length === 0) {
      const result = new Set([digest]);
      rootMemo.set(digest, result);
      return result;
    }
    const result = new Set();
    for (const parent of parents) {
      for (const root of rootsFor(parent)) result.add(root);
    }
    rootMemo.set(digest, result);
    return result;
  };

  const frontierCountsByRoot = new Map(roots.map(root => [root, 0]));
  for (const digest of frontier) {
    for (const root of rootsFor(digest)) {
      frontierCountsByRoot.set(root, (frontierCountsByRoot.get(root) ?? 0) + 1);
    }
  }

  const dominantRootFrontierShare = frontier.length === 0
    ? 0
    : Math.max(0, ...frontierCountsByRoot.values()) / frontier.length;

  const contradictionCount = relations
    .filter(relation => relation.predicate === 'contradicts')
    .length;
  const failedReproductionCount = relations
    .filter(relation => relation.predicate === 'failed_to_reproduce')
    .length;
  const independentReproductionCount = relations
    .filter(relation => (
      relation.predicate === 'reproduces'
      && relation.independence_state === 'independent'
    ))
    .length;

  const problemDigests = new Set();
  const independentTargets = new Set();

  for (const relation of relations) {
    if (relation.predicate === 'contradicts' || relation.predicate === 'failed_to_reproduce') {
      problemDigests.add(relation.subject_contribution_digest);
      problemDigests.add(relation.object_contribution_digest);
    }
    if (
      relation.predicate === 'reproduces'
      && relation.independence_state === 'independent'
    ) {
      independentTargets.add(relation.object_contribution_digest);
    }
  }

  const attentionCandidates = frontier
    .filter(digest => {
      const contribution = byDigest.get(digest);
      if (problemDigests.has(digest)) return true;
      if (contribution.contribution_kind === 'verification') return false;
      return !independentTargets.has(digest);
    })
    .sort();

  return {
    root_contribution_digests: roots,
    frontier_contribution_digests: frontier,
    attention_candidate_digests: attentionCandidates,
    metrics: {
      contribution_count: contributions.length,
      relation_count: relations.length,
      contradiction_count: contradictionCount,
      failed_reproduction_count: failedReproductionCount,
      independent_reproduction_count: independentReproductionCount,
      max_lineage_depth: maxLineageDepth,
      dominant_root_frontier_share: dominantRootFrontierShare
    }
  };
}

function assertAcyclicLineage(digests, parentsBySubject) {
  const state = new Map();

  const visit = digest => {
    const current = state.get(digest) ?? 0;
    if (current === 1) {
      throw new ValidationError(
        `ResearchCompositionGraph lineage cycle detected at ${digest}`
      );
    }
    if (current === 2) return;

    state.set(digest, 1);
    for (const parent of parentsBySubject.get(digest) ?? []) {
      visit(parent);
    }
    state.set(digest, 2);
  };

  for (const digest of digests) visit(digest);
}

function boundedCanonical(value, name) {
  assertPlainObject(value, name);
  const encoded = canonicalJson(value);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_OBJECT_BYTES) {
    throw new ValidationError(`${name} exceeds ${MAX_OBJECT_BYTES} bytes`);
  }
  return JSON.parse(encoded);
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

function assertSchema(value, expected, name) {
  if (value !== expected) {
    throw new ValidationError(`${name}.schema must equal ${expected}`);
  }
}

function assertIdentifier(value, name) {
  assertString(value, name, { max: 512 });
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new ValidationError(`${name} has invalid identifier syntax`);
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

function assertUniqueStrings(value, name, {
  maxItems = 32,
  itemMax = 2048
} = {}) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${name} must be an array`);
  }
  if (value.length > maxItems) {
    throw new ValidationError(`${name} must contain at most ${maxItems} items`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    assertNonEmptyString(item, `${name}[${index}]`, itemMax);
    if (seen.has(item)) {
      throw new ValidationError(`${name} items must be unique`);
    }
    seen.add(item);
  }
}

function assertSelfDigest(object, digestField, name) {
  const expected = researchContractDigest(object, digestField);
  if (object[digestField] !== expected) {
    throw new ValidationError(`${name} digest mismatch`);
  }
}
