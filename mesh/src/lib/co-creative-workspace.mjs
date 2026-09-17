import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  canonicalSharedArtifactDigest,
  validateCanonicalSharedArtifact
} from './canonical-shared-artifact.mjs';

export const CO_CREATIVE_WORKSPACE_PROPOSAL_SCHEMA = 'axiom-co-creative-workspace-proposal.v0';

const VERSION = 0;
const STATUS = 'inert-reviewed-change-proposal';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,139}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ACTOR_KINDS = new Set(['human', 'agent']);
const PROPOSAL_KINDS = new Set(['edit', 'revert']);
const PROPOSAL_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'proposal_id',
  'artifact_id',
  'base_artifact_digest',
  'base_heads',
  'kind',
  'source_revision_id',
  'actor_principal',
  'actor_kind',
  'payload',
  'content_digest',
  'rationale',
  'proposed_at',
  'authority_effect',
  'network_effect',
  'runtime_activation'
]);

function exactFields(value, fields, name) {
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} contains unknown field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${name}.${key} is required`);
  }
}

function identifier(value, name) {
  return assertString(value, name, { max: 140, pattern: IDENTIFIER });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function timestamp(value, name) {
  assertString(value, name, { min: 24, max: 24, pattern: CANONICAL_TIMESTAMP });
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical UTC timestamp`);
  }
  return value;
}

function validatePayload(contentType, payload, name) {
  if (contentType === 'text/plain' && typeof payload !== 'string') {
    throw new ValidationError(`${name} text payload must be a string`);
  }
  try {
    return digestObject({ content_type: contentType, payload });
  } catch (error) {
    throw new ValidationError(`${name} payload must be canonical JSON data`, { cause: error?.message });
  }
}

function activeSingleHeadArtifact(artifact) {
  const summary = validateCanonicalSharedArtifact(artifact);
  if (summary.state !== 'active' || summary.current_heads.length !== 1) {
    throw new ValidationError('co-creative workspace v0 requires one active canonical artifact head');
  }
  return summary;
}

function freezeProposal(proposal) {
  Object.freeze(proposal.base_heads);
  return Object.freeze(proposal);
}

export function validateCoCreativeWorkspaceProposal(input) {
  const value = assertPlainObject(input, 'co-creative workspace proposal');
  exactFields(value, PROPOSAL_FIELDS, 'co-creative workspace proposal');
  if (value.schema !== CO_CREATIVE_WORKSPACE_PROPOSAL_SCHEMA) {
    throw new ValidationError('co-creative workspace proposal schema is unsupported');
  }
  if (value.version !== VERSION) throw new ValidationError(`co-creative workspace proposal version must be ${VERSION}`);
  if (value.status !== STATUS) throw new ValidationError(`co-creative workspace proposal status must be ${STATUS}`);
  if (value.authority_effect !== 'none') throw new ValidationError('co-creative workspace proposal authority effect must be none');
  if (value.network_effect !== 'none') throw new ValidationError('co-creative workspace proposal network effect must be none');
  if (value.runtime_activation !== false) throw new ValidationError('co-creative workspace proposal runtime activation must be false');

  const proposalId = identifier(value.proposal_id, 'co-creative workspace proposal.proposal_id');
  const artifactId = identifier(value.artifact_id, 'co-creative workspace proposal.artifact_id');
  const baseArtifactDigest = digest(value.base_artifact_digest, 'co-creative workspace proposal.base_artifact_digest');
  if (!Array.isArray(value.base_heads) || value.base_heads.length !== 1) {
    throw new ValidationError('co-creative workspace proposal requires exactly one base head');
  }
  const baseHead = identifier(value.base_heads[0], 'co-creative workspace proposal.base_heads[0]');
  const kind = assertString(value.kind, 'co-creative workspace proposal.kind', { max: 16 });
  if (!PROPOSAL_KINDS.has(kind)) throw new ValidationError('co-creative workspace proposal kind is unsupported');
  const actorPrincipal = identifier(value.actor_principal, 'co-creative workspace proposal.actor_principal');
  const actorKind = assertString(value.actor_kind, 'co-creative workspace proposal.actor_kind', { max: 16 });
  if (!ACTOR_KINDS.has(actorKind)) {
    throw new ValidationError('co-creative workspace proposal actor must be human or agent');
  }
  const rationale = assertString(value.rationale, 'co-creative workspace proposal.rationale', { min: 1, max: 1024 });
  const proposedAt = timestamp(value.proposed_at, 'co-creative workspace proposal.proposed_at');
  const contentDigest = digest(value.content_digest, 'co-creative workspace proposal.content_digest');

  let sourceRevisionId = value.source_revision_id;
  if (kind === 'edit') {
    if (sourceRevisionId !== null) throw new ValidationError('edit proposal cannot name a source revision');
  } else {
    sourceRevisionId = identifier(sourceRevisionId, 'co-creative workspace proposal.source_revision_id');
  }

  return Object.freeze({
    valid: true,
    schema: CO_CREATIVE_WORKSPACE_PROPOSAL_SCHEMA,
    proposal_id: proposalId,
    artifact_id: artifactId,
    base_artifact_digest: baseArtifactDigest,
    base_heads: Object.freeze([baseHead]),
    kind,
    source_revision_id: sourceRevisionId,
    actor_principal: actorPrincipal,
    actor_kind: actorKind,
    content_digest: contentDigest,
    rationale,
    proposed_at: proposedAt,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

function createProposal({
  artifact,
  proposalId,
  actorPrincipal,
  actorKind,
  payload,
  rationale,
  proposedAt,
  kind,
  sourceRevisionId
}) {
  const artifactSummary = activeSingleHeadArtifact(artifact);
  if (!ACTOR_KINDS.has(actorKind)) {
    throw new ValidationError('co-creative workspace proposal actor must be human or agent');
  }
  const contentDigest = validatePayload(artifact.content_type, payload, 'co-creative workspace proposal');
  const proposal = {
    schema: CO_CREATIVE_WORKSPACE_PROPOSAL_SCHEMA,
    version: VERSION,
    status: STATUS,
    proposal_id: identifier(proposalId, 'co-creative workspace proposal.proposal_id'),
    artifact_id: artifactSummary.artifact_id,
    base_artifact_digest: canonicalSharedArtifactDigest(artifact),
    base_heads: [artifactSummary.current_heads[0]],
    kind,
    source_revision_id: sourceRevisionId,
    actor_principal: identifier(actorPrincipal, 'co-creative workspace proposal.actor_principal'),
    actor_kind: actorKind,
    payload: structuredClone(payload),
    content_digest: contentDigest,
    rationale: assertString(rationale, 'co-creative workspace proposal.rationale', { min: 1, max: 1024 }),
    proposed_at: timestamp(proposedAt, 'co-creative workspace proposal.proposed_at'),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
  validateCoCreativeWorkspaceProposal(proposal);
  return freezeProposal(proposal);
}

export function createCoCreativeEditProposal({
  artifact,
  proposalId,
  actorPrincipal,
  actorKind,
  payload,
  rationale,
  proposedAt
}) {
  return createProposal({
    artifact,
    proposalId,
    actorPrincipal,
    actorKind,
    payload,
    rationale,
    proposedAt,
    kind: 'edit',
    sourceRevisionId: null
  });
}

export function createCoCreativeRevertProposal({
  artifact,
  proposalId,
  actorPrincipal,
  actorKind,
  sourceRevisionId,
  rationale,
  proposedAt
}) {
  activeSingleHeadArtifact(artifact);
  const source = artifact.revisions.find(revision => revision.revision_id === sourceRevisionId);
  if (!source) throw new ValidationError('co-creative workspace revert source revision does not exist');
  if (source.payload === null || source.content_digest === null) {
    throw new ValidationError('co-creative workspace cannot revert to a contentless revision');
  }
  return createProposal({
    artifact,
    proposalId,
    actorPrincipal,
    actorKind,
    payload: source.payload,
    rationale,
    proposedAt,
    kind: 'revert',
    sourceRevisionId
  });
}

function assertCurrentBase(artifact, proposal) {
  const summary = activeSingleHeadArtifact(artifact);
  if (summary.artifact_id !== proposal.artifact_id) {
    throw new ValidationError('co-creative workspace proposal targets a different artifact');
  }
  const currentDigest = canonicalSharedArtifactDigest(artifact);
  if (currentDigest !== proposal.base_artifact_digest || summary.current_heads[0] !== proposal.base_heads[0]) {
    throw new ValidationError('co-creative workspace proposal base is stale');
  }
  return summary;
}

export function reviewCoCreativeWorkspaceProposal({
  artifact,
  proposal,
  decision,
  authorization = null,
  acceptedAt = null
}) {
  const proposalSummary = validateCoCreativeWorkspaceProposal(proposal);
  const artifactSummary = assertCurrentBase(artifact, proposalSummary);
  if (decision === 'reject') {
    return Object.freeze({
      decision: 'rejected',
      proposal_id: proposalSummary.proposal_id,
      artifact_id: artifactSummary.artifact_id,
      artifact_digest: canonicalSharedArtifactDigest(artifact),
      changed: false,
      authority_effect: 'none',
      network_effect: 'none',
      runtime_activation: false
    });
  }
  if (decision !== 'accept') throw new ValidationError('co-creative workspace review decision must be accept or reject');
  if (authorization === null) {
    throw new ValidationError('co-creative workspace acceptance requires explicit authorization evidence');
  }
  const acceptedTimestamp = timestamp(acceptedAt, 'co-creative workspace acceptance timestamp');
  const revisionId = `revision:${proposalSummary.proposal_id}`;
  const next = structuredClone(artifact);
  next.revisions.push({
    revision_id: revisionId,
    parents: [artifactSummary.current_heads[0]],
    operation: 'put',
    actor_principal: proposalSummary.actor_principal,
    actor_kind: proposalSummary.actor_kind,
    authorization: structuredClone(authorization),
    payload: structuredClone(proposal.payload),
    content_digest: proposalSummary.content_digest,
    resolves: [],
    work_graph: null,
    occurred_at: acceptedTimestamp
  });
  next.current_heads = [revisionId];
  next.state = 'active';
  next.current_content_digest = proposalSummary.content_digest;
  next.updated_at = acceptedTimestamp;

  const nextSummary = validateCanonicalSharedArtifact(next);
  return Object.freeze({
    decision: 'accepted',
    proposal_id: proposalSummary.proposal_id,
    proposal_digest: digestObject(proposal),
    artifact: next,
    artifact_digest: canonicalSharedArtifactDigest(next),
    revision_id: revisionId,
    current_heads: nextSummary.current_heads,
    changed: true,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}
