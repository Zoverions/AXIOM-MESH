import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const OBLIGATION_CONTRACT_SCHEMA = 'axiom-obligation-contract.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const SETTLEMENT_STATES = new Set([
  'draft',
  'offered',
  'accepted_as_record',
  'active_obligation_set',
  'partially_fulfilled',
  'fulfilled',
  'claimed_breach',
  'in_dispute',
  'cure_pending',
  'settled',
  'terminated',
  'expired'
]);

function exact(raw, fields, label) {
  const value = assertPlainObject(raw, label);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function timestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be canonical UTC ISO`);
  }
  return text;
}

export function validateObligationContract(raw) {
  const value = exact(raw, [
    'schema','contract_id','version','status','parties','context','obligations',
    'dispute','authority','limitations'
  ], 'obligation contract');

  if (value.schema !== OBLIGATION_CONTRACT_SCHEMA) {
    throw new ValidationError('obligation contract schema is invalid');
  }

  id(value.contract_id, 'contract_id');
  assertString(value.version, 'version', {
    min: 5, max: 32, pattern: /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/
  });

  const status = id(value.status, 'status');
  if (!SETTLEMENT_STATES.has(status)) {
    throw new ValidationError('obligation contract status is invalid');
  }

  if (!Array.isArray(value.parties) || value.parties.length < 2 || value.parties.length > 128) {
    throw new ValidationError('obligation contract requires 2-128 parties');
  }
  const partyIds = new Set();
  for (const [index, rawParty] of value.parties.entries()) {
    const party = exact(rawParty, ['party_id','role','identity_evidence_refs'], `parties[${index}]`);
    const partyId = id(party.party_id, `parties[${index}].party_id`);
    if (partyIds.has(partyId)) throw new ValidationError('party IDs must be unique');
    partyIds.add(partyId);
    id(party.role, `parties[${index}].role`);
    assertStringArray(party.identity_evidence_refs, `parties[${index}].identity_evidence_refs`, {
      maxItems: 64, itemMax: 512
    });
  }

  const context = exact(value.context, [
    'jurisdiction_or_policy_refs','effective_from','expires_at','human_review_required'
  ], 'context');
  assertStringArray(context.jurisdiction_or_policy_refs, 'context.jurisdiction_or_policy_refs', {
    maxItems: 64, itemMax: 512
  });

  const effectiveFrom = timestamp(context.effective_from, 'context.effective_from');
  const expiresAt = timestamp(context.expires_at, 'context.expires_at');
  if (new Date(expiresAt).valueOf() <= new Date(effectiveFrom).valueOf()) {
    throw new ValidationError('context.expires_at must be after context.effective_from');
  }

  if (typeof context.human_review_required !== 'boolean') {
    throw new ValidationError('context.human_review_required must be boolean');
  }

  if (!Array.isArray(value.obligations) || value.obligations.length === 0 || value.obligations.length > 256) {
    throw new ValidationError('obligation contract requires 1-256 obligations');
  }
  const obligationIds = new Set();
  for (const [index, rawObligation] of value.obligations.entries()) {
    const obligation = exact(rawObligation, [
      'obligation_id','obligor','beneficiary','action_or_result','conditions',
      'deadline','evidence_required','verification_mode','automatic_execution'
    ], `obligations[${index}]`);

    const obligationId = id(obligation.obligation_id, `obligations[${index}].obligation_id`);
    if (obligationIds.has(obligationId)) throw new ValidationError('obligation IDs must be unique');
    obligationIds.add(obligationId);

    if (!partyIds.has(obligation.obligor) || !partyIds.has(obligation.beneficiary)) {
      throw new ValidationError('obligation parties must reference declared parties');
    }
    assertString(obligation.action_or_result, `obligations[${index}].action_or_result`, {
      min: 1, max: 2048
    });
    assertStringArray(obligation.conditions, `obligations[${index}].conditions`, {
      maxItems: 64, itemMax: 1024
    });

    const deadline = timestamp(obligation.deadline, `obligations[${index}].deadline`);
    if (new Date(deadline).valueOf() < new Date(effectiveFrom).valueOf()) {
      throw new ValidationError('obligation deadline cannot precede contract effective_from');
    }

    const evidence = assertStringArray(obligation.evidence_required, `obligations[${index}].evidence_required`, {
      maxItems: 64, itemMax: 512
    });
    if (evidence.length === 0) throw new ValidationError('each obligation requires evidence_required');
    id(obligation.verification_mode, `obligations[${index}].verification_mode`);
    if (obligation.automatic_execution !== false) {
      throw new ValidationError('obligation contract cannot directly enable automatic execution');
    }
  }

  const dispute = exact(value.dispute, [
    'challenge_allowed','review_required_for_breach','remedy_requires_separate_authority'
  ], 'dispute');
  if (dispute.challenge_allowed !== true) throw new ValidationError('dispute challenge path is required');
  if (dispute.review_required_for_breach !== true) throw new ValidationError('breach requires review');
  if (dispute.remedy_requires_separate_authority !== true) {
    throw new ValidationError('remedy requires separate authority');
  }

  const authority = exact(value.authority, [
    'signature_grants_runtime_authority',
    'contract_grants_runtime_authority',
    'fulfillment_grants_runtime_authority',
    'breach_grants_remedy_authority'
  ], 'authority');

  for (const [field, actual] of Object.entries(authority)) {
    if (actual !== false) throw new ValidationError(`authority.${field} must be false`);
  }

  const limitations = assertStringArray(value.limitations, 'limitations', {
    maxItems: 64, itemMax: 512
  });
  if (limitations.length === 0) throw new ValidationError('obligation contract must declare limitations');

  return Object.freeze({
    valid: true,
    contract_id: value.contract_id,
    status,
    obligation_count: value.obligations.length,
    contract_effect: 'obligation_and_evidence_structure_only',
    authority_effect: 'none',
    automatic_execution: false
  });
}
