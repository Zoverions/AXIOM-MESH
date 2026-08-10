import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';

export const INTENT_REMEDIATION_SCHEMA = 'axiom-intent-remediation-proposal.v1';
export const INTENT_REMEDIATION_RECORD_KIND = 'intent.remediation.proposed';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const DECISIONS = new Set(['autonomous', 'approval_required', 'deny']);
const RECONCILIATION_STATES = new Set(['blocked', 'attention_required']);
const MAX_PROPOSAL_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function isoDate(value, name) {
  const date = new Date(assertString(value, name, { max: 64 }));
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return date.toISOString();
}

function sortedUniqueStrings(value, name) {
  if (!Array.isArray(value) || value.length > 512) {
    throw new ValidationError(`${name} must be an array with at most 512 items`);
  }
  return [...new Set(value.map((item, index) => assertString(
    item,
    `${name}[${index}]`,
    { max: 160, pattern: ID }
  )))].sort();
}

function normalizeActions(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 256) {
    throw new ValidationError('remediation actions must contain 1-256 items');
  }
  const actions = raw.map((item, index) => {
    const value = assertPlainObject(item, `remediation.actions[${index}]`);
    const decision = assertString(value.decision, `remediation.actions[${index}].decision`, {
      max: 32
    });
    if (!DECISIONS.has(decision)) {
      throw new ValidationError('remediation action decision is invalid');
    }
    return {
      action: assertString(value.action, `remediation.actions[${index}].action`, {
        max: 160,
        pattern: /^[a-z][a-z0-9._:-]*(?:\.\*)?$/
      }),
      decision,
      reason: assertString(value.reason, `remediation.actions[${index}].reason`, { max: 256 }),
      triggered_by: sortedUniqueStrings(
        value.triggered_by ?? [],
        `remediation.actions[${index}].triggered_by`
      )
    };
  }).sort((left, right) => left.action.localeCompare(right.action));
  const names = actions.map(item => item.action);
  if (new Set(names).size !== names.length) {
    throw new ValidationError('remediation actions must be unique by action');
  }
  return actions;
}

function proposalBasisFromGovernanceState(state) {
  const value = assertPlainObject(state, 'Intent governance state');
  if (value.schema !== 'axiom-intent-governance-state.v1') {
    throw new ValidationError('remediation proposal requires axiom-intent-governance-state.v1');
  }
  if (value.execution_authorized !== false) {
    throw new ValidationError('remediation proposal source must remain non-executing');
  }
  const reconciliation = assertPlainObject(value.reconciliation, 'Intent reconciliation');
  const reconciliationState = assertString(
    reconciliation.state,
    'Intent reconciliation.state',
    { max: 32 }
  );
  if (!RECONCILIATION_STATES.has(reconciliationState)) {
    throw new ValidationError('converged Intent state has no remediation proposal');
  }
  const actions = normalizeActions(reconciliation.proposed_actions ?? []);
  const assessment = assertPlainObject(value.assessment, 'Intent assessment');
  const build = assertPlainObject(value.build, 'Intent build');
  const body = {
    contract_id: assertString(value.contract_id, 'contract_id', { max: 160, pattern: ID }),
    activation_digest: assertDigest(value.activation_digest, 'activation_digest'),
    contract_digest: assertDigest(value.contract_digest, 'contract_digest'),
    graph_digest: assertDigest(value.graph_digest, 'graph_digest'),
    build_digest: assertDigest(build.build_digest, 'build.build_digest'),
    source_assessment_digest: assertDigest(
      assessment.source_assessment_digest,
      'assessment.source_assessment_digest'
    ),
    source_reconciliation_digest: assertDigest(
      reconciliation.reconciliation_digest,
      'reconciliation.reconciliation_digest'
    ),
    basis_evaluated_at: isoDate(assessment.evaluated_at, 'assessment.evaluated_at'),
    reconciliation_state: reconciliationState,
    violations: sortedUniqueStrings(reconciliation.violations ?? [], 'reconciliation.violations'),
    unknowns: sortedUniqueStrings(reconciliation.unknowns ?? [], 'reconciliation.unknowns'),
    actions
  };
  return {
    ...body,
    basis_digest: digestObject(body)
  };
}

export function buildIntentRemediationProposal(rawGovernanceState, {
  creator,
  created_at = new Date().toISOString(),
  expires_at = null
}) {
  const basis = proposalBasisFromGovernanceState(rawGovernanceState);
  const createdAt = isoDate(created_at, 'created_at');
  const expiresAt = expires_at === null ? null : isoDate(expires_at, 'expires_at');
  if (expiresAt !== null) {
    const lifetime = new Date(expiresAt).valueOf() - new Date(createdAt).valueOf();
    if (lifetime <= 0 || lifetime > MAX_PROPOSAL_LIFETIME_MS) {
      throw new ValidationError('remediation proposal expiry must be after creation and within 30 days');
    }
  }
  const body = {
    schema: INTENT_REMEDIATION_SCHEMA,
    record_kind: INTENT_REMEDIATION_RECORD_KIND,
    ...basis,
    creator: assertString(creator, 'creator', { max: 160, pattern: ID }),
    created_at: createdAt,
    expires_at: expiresAt,
    execution_authorized: false,
    non_claim: 'Governance may review or ratify this remediation proposal, but AXIOM Intent v0.5 cannot execute its actions.'
  };
  const proposalDigest = digestObject(body);
  return {
    ...body,
    remediation_proposal_id: `intent-remediation:${proposalDigest}`,
    remediation_proposal_digest: proposalDigest
  };
}

export function normalizeIntentRemediationProposal(raw) {
  const value = assertPlainObject(raw, 'Intent remediation proposal');
  if (value.schema !== INTENT_REMEDIATION_SCHEMA) {
    throw new ValidationError(`remediation schema must be ${INTENT_REMEDIATION_SCHEMA}`);
  }
  if (value.record_kind !== INTENT_REMEDIATION_RECORD_KIND) {
    throw new ValidationError(`remediation record_kind must be ${INTENT_REMEDIATION_RECORD_KIND}`);
  }
  const basisBody = {
    contract_id: assertString(value.contract_id, 'contract_id', { max: 160, pattern: ID }),
    activation_digest: assertDigest(value.activation_digest, 'activation_digest'),
    contract_digest: assertDigest(value.contract_digest, 'contract_digest'),
    graph_digest: assertDigest(value.graph_digest, 'graph_digest'),
    build_digest: assertDigest(value.build_digest, 'build_digest'),
    source_assessment_digest: assertDigest(value.source_assessment_digest, 'source_assessment_digest'),
    source_reconciliation_digest: assertDigest(
      value.source_reconciliation_digest,
      'source_reconciliation_digest'
    ),
    basis_evaluated_at: isoDate(value.basis_evaluated_at, 'basis_evaluated_at'),
    reconciliation_state: assertString(value.reconciliation_state, 'reconciliation_state', {
      max: 32
    }),
    violations: sortedUniqueStrings(value.violations ?? [], 'violations'),
    unknowns: sortedUniqueStrings(value.unknowns ?? [], 'unknowns'),
    actions: normalizeActions(value.actions ?? [])
  };
  if (!RECONCILIATION_STATES.has(basisBody.reconciliation_state)) {
    throw new ValidationError('remediation reconciliation_state is invalid');
  }
  const basisDigest = digestObject(basisBody);
  if (assertDigest(value.basis_digest, 'basis_digest') !== basisDigest) {
    throw new ValidationError('remediation basis_digest is invalid');
  }
  const createdAt = isoDate(value.created_at, 'created_at');
  const expiresAt = value.expires_at === null ? null : isoDate(value.expires_at, 'expires_at');
  if (expiresAt !== null) {
    const lifetime = new Date(expiresAt).valueOf() - new Date(createdAt).valueOf();
    if (lifetime <= 0 || lifetime > MAX_PROPOSAL_LIFETIME_MS) {
      throw new ValidationError('remediation proposal expiry must be after creation and within 30 days');
    }
  }
  if (value.execution_authorized !== false) {
    throw new ValidationError('remediation proposal must have execution_authorized=false');
  }
  const body = {
    schema: INTENT_REMEDIATION_SCHEMA,
    record_kind: INTENT_REMEDIATION_RECORD_KIND,
    ...basisBody,
    basis_digest: basisDigest,
    creator: assertString(value.creator, 'creator', { max: 160, pattern: ID }),
    created_at: createdAt,
    expires_at: expiresAt,
    execution_authorized: false,
    non_claim: assertString(value.non_claim, 'non_claim', { max: 512 })
  };
  const digest = digestObject(body);
  if (assertDigest(value.remediation_proposal_digest, 'remediation_proposal_digest') !== digest) {
    throw new ValidationError('remediation proposal digest is invalid');
  }
  const id = assertString(value.remediation_proposal_id, 'remediation_proposal_id', { max: 160 });
  if (id !== `intent-remediation:${digest}`) {
    throw new ValidationError('remediation proposal ID is not content-addressed');
  }
  return {
    ...body,
    remediation_proposal_id: id,
    remediation_proposal_digest: digest
  };
}

export function remediationGovernanceAction(rawProposal) {
  const proposal = normalizeIntentRemediationProposal(rawProposal);
  return {
    type: 'record.decision',
    payload: {
      schema: INTENT_REMEDIATION_SCHEMA,
      record_kind: INTENT_REMEDIATION_RECORD_KIND,
      remediation: proposal
    },
    rollback: {
      description: `Withdraw ratification of remediation proposal ${proposal.remediation_proposal_id}; no remediation action is executed by activation.`
    }
  };
}

export function isIntentRemediationAction(action) {
  return Boolean(
    action
    && typeof action === 'object'
    && !Array.isArray(action)
    && action.type === 'record.decision'
    && action.payload?.record_kind === INTENT_REMEDIATION_RECORD_KIND
    && action.payload?.remediation
  );
}

export function validateIntentRemediationProposalAgainstState(rawProposal, rawFullState, {
  actor,
  now = new Date().toISOString()
} = {}) {
  const proposal = normalizeIntentRemediationProposal(rawProposal);
  const state = assertPlainObject(rawFullState, 'current Intent Grid state');
  if (state.schema !== 'axiom-intent-grid-state.v1') {
    throw new ValidationError('remediation validation requires axiom-intent-grid-state.v1');
  }
  if (state.execution_authorized !== false) {
    throw new ValidationError('current Intent Grid state unexpectedly authorizes execution');
  }
  if (actor !== undefined && proposal.creator !== actor) {
    throw new ValidationError('remediation proposal creator must match the authenticated actor');
  }
  const nowIso = isoDate(now, 'now');
  if (proposal.expires_at !== null && proposal.expires_at <= nowIso) {
    throw new ValidationError('remediation proposal is expired');
  }
  if (proposal.created_at < proposal.basis_evaluated_at) {
    throw new ValidationError('remediation proposal cannot predate its source assessment');
  }
  const activation = assertPlainObject(state.activation, 'current activation');
  const assessment = assertPlainObject(state.assessment, 'current assessment');
  const reconciliation = assertPlainObject(state.reconciliation, 'current reconciliation');
  const expected = {
    contract_id: activation.contract_id,
    activation_digest: activation.activation_digest,
    contract_digest: activation.contract_digest,
    graph_digest: activation.graph_digest,
    build_digest: activation.build?.build_digest,
    source_assessment_digest: assessment.assessment_digest,
    source_reconciliation_digest: reconciliation.reconciliation_digest,
    basis_evaluated_at: assessment.evaluated_at,
    reconciliation_state: reconciliation.state,
    violations: [...(reconciliation.violations ?? [])].sort(),
    unknowns: [...(reconciliation.unknowns ?? [])].sort(),
    actions: normalizeActions(reconciliation.proposed_actions ?? [])
  };
  const actual = {
    contract_id: proposal.contract_id,
    activation_digest: proposal.activation_digest,
    contract_digest: proposal.contract_digest,
    graph_digest: proposal.graph_digest,
    build_digest: proposal.build_digest,
    source_assessment_digest: proposal.source_assessment_digest,
    source_reconciliation_digest: proposal.source_reconciliation_digest,
    basis_evaluated_at: proposal.basis_evaluated_at,
    reconciliation_state: proposal.reconciliation_state,
    violations: proposal.violations,
    unknowns: proposal.unknowns,
    actions: proposal.actions
  };
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new ValidationError('remediation proposal no longer matches the current authenticated Intent state');
  }
  if (digestObject(expected) !== proposal.basis_digest) {
    throw new ValidationError('remediation proposal basis no longer matches current authenticated state');
  }
  return proposal;
}
