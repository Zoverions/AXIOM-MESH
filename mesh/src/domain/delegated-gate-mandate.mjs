import { ValidationError, assertPlainObject, assertString } from '../lib/canonical.mjs';
import { assertAuthorityNeutral, assertEnum, assertIsoTimestamp, assertNoUnknownKeys, assertReference, assertUniqueStrings } from './sovereign-information-common.mjs';

export const DELEGATED_GATE_MANDATE_SCHEMA = 'axiom-delegated-gate-mandate.v1';
const ASSURANCE = ['standard','enhanced','high-assurance','critical-assurance'];
const ASSURANCE_SET = new Set(ASSURANCE);
const DELEGATION = new Set(['none','attenuation-only']);
const ROOT_KEYS = new Set(['schema','mandate_id','grantor','delegate','domains','actions','purposes','data_classes','destinations','resource_ceilings','assurance_ceiling','allowed_gate_decisions','escalation_conditions','credential_rules','retention_constraints','starts_at','expires_at','revocation','delegation','receipt_required']);
const REVOCATION_KEYS = new Set(['revoked','revoked_at','reason']);
const DELEGATION_KEYS = new Set(['mode']);
const CREDENTIAL_KEYS = new Set(['allow_opaque_handle','allow_raw_secret']);
const RESOURCE_KEYS = new Set(['max_records','max_value_minor']);
const REQUEST_KEYS = new Set(['delegate','domain','action','purpose','data_class','destination','assurance_profile','gate_decision','resource_usage']);
const REQUEST_RESOURCE_KEYS = new Set(['records','value_minor']);

function requireStrings(values,name,{min=1}={}) { return assertUniqueStrings(values,name,{min}); }
function inScope(value, values){ return values.includes(value); }
function no(reason_code){ return { gate_authorized:false, reason_code }; }

function validateDelegatedGateRequest(request) {
  assertAuthorityNeutral(request,'delegated gate request');
  assertNoUnknownKeys(request,'delegated gate request',REQUEST_KEYS);
  assertReference(request.delegate,'request.delegate');
  assertString(request.domain,'request.domain',{max:128});
  assertString(request.action,'request.action',{max:256});
  assertString(request.purpose,'request.purpose',{max:256});
  assertString(request.data_class,'request.data_class',{max:128});
  assertReference(request.destination,'request.destination');
  assertEnum(request.assurance_profile,'request.assurance_profile',ASSURANCE_SET);
  assertString(request.gate_decision,'request.gate_decision',{max:256});
  assertPlainObject(request.resource_usage,'request.resource_usage');
  assertNoUnknownKeys(request.resource_usage,'request.resource_usage',REQUEST_RESOURCE_KEYS);
  for (const field of REQUEST_RESOURCE_KEYS) {
    if (!Number.isInteger(request.resource_usage[field]) || request.resource_usage[field] < 0) throw new ValidationError(`request.resource_usage.${field} must be a non-negative integer`);
  }
  return request;
}

export function validateDelegatedGateMandate(mandate) {
  assertAuthorityNeutral(mandate,'delegated gate mandate');
  assertNoUnknownKeys(mandate,'delegated gate mandate',ROOT_KEYS);
  if (mandate.schema !== DELEGATED_GATE_MANDATE_SCHEMA) throw new ValidationError('delegated gate mandate has unsupported schema');
  assertReference(mandate.mandate_id,'mandate_id');
  assertReference(mandate.grantor,'grantor');
  assertReference(mandate.delegate,'delegate');
  for (const field of ['domains','actions','purposes','data_classes','destinations','allowed_gate_decisions','escalation_conditions','retention_constraints']) requireStrings(mandate[field],field);
  assertEnum(mandate.assurance_ceiling,'assurance_ceiling',ASSURANCE_SET);
  assertPlainObject(mandate.resource_ceilings,'resource_ceilings');
  assertNoUnknownKeys(mandate.resource_ceilings,'resource_ceilings',RESOURCE_KEYS);
  for (const field of RESOURCE_KEYS) {
    if (!Number.isInteger(mandate.resource_ceilings[field]) || mandate.resource_ceilings[field] < 0) throw new ValidationError(`resource_ceilings.${field} must be a non-negative integer`);
  }
  assertPlainObject(mandate.credential_rules,'credential_rules');
  assertNoUnknownKeys(mandate.credential_rules,'credential_rules',CREDENTIAL_KEYS);
  if (typeof mandate.credential_rules.allow_opaque_handle !== 'boolean') throw new ValidationError('credential_rules.allow_opaque_handle must be boolean');
  if (mandate.credential_rules.allow_raw_secret !== false) throw new ValidationError('credential_rules.allow_raw_secret must be false in Slice 1');
  assertIsoTimestamp(mandate.starts_at,'starts_at');
  assertIsoTimestamp(mandate.expires_at,'expires_at');
  if (Date.parse(mandate.starts_at) >= Date.parse(mandate.expires_at)) throw new ValidationError('starts_at must precede expires_at');
  assertPlainObject(mandate.revocation,'revocation');
  assertNoUnknownKeys(mandate.revocation,'revocation',REVOCATION_KEYS);
  if (typeof mandate.revocation.revoked !== 'boolean') throw new ValidationError('revocation.revoked must be boolean');
  if (mandate.revocation.revoked) {
    assertIsoTimestamp(mandate.revocation.revoked_at,'revocation.revoked_at');
    assertString(mandate.revocation.reason,'revocation.reason',{max:512});
  } else if (mandate.revocation.revoked_at !== null || mandate.revocation.reason !== null) {
    throw new ValidationError('non-revoked mandate must have null revocation details');
  }
  assertPlainObject(mandate.delegation,'delegation');
  assertNoUnknownKeys(mandate.delegation,'delegation',DELEGATION_KEYS);
  assertEnum(mandate.delegation.mode,'delegation.mode',DELEGATION);
  if (typeof mandate.receipt_required !== 'boolean') throw new ValidationError('receipt_required must be boolean');
  return mandate;
}

export function evaluateDelegatedGateMandate(mandate, request, {now}) {
  validateDelegatedGateMandate(mandate);
  validateDelegatedGateRequest(request);
  assertIsoTimestamp(now,'now');
  if (request.delegate !== mandate.delegate) return no('delegate_mismatch');
  if (Date.parse(now) < Date.parse(mandate.starts_at)) return no('mandate_not_started');
  if (Date.parse(now) >= Date.parse(mandate.expires_at)) return no('mandate_expired');
  if (mandate.revocation.revoked) return no('mandate_revoked');
  if (!inScope(request.domain,mandate.domains)) return no('domain_out_of_scope');
  if (!inScope(request.action,mandate.actions)) return no('action_out_of_scope');
  if (!inScope(request.purpose,mandate.purposes)) return no('purpose_out_of_scope');
  if (!inScope(request.data_class,mandate.data_classes)) return no('data_class_out_of_scope');
  if (!inScope(request.destination,mandate.destinations)) return no('destination_out_of_scope');
  if (request.resource_usage.records > mandate.resource_ceilings.max_records) return no('resource_records_exceeds_ceiling');
  if (request.resource_usage.value_minor > mandate.resource_ceilings.max_value_minor) return no('resource_value_exceeds_ceiling');
  const requested = ASSURANCE.indexOf(request.assurance_profile);
  const ceiling = ASSURANCE.indexOf(mandate.assurance_ceiling);
  if (requested === -1 || requested > ceiling) return no('assurance_exceeds_ceiling');
  if (!inScope(request.gate_decision,mandate.allowed_gate_decisions)) return no('gate_decision_out_of_scope');
  return { gate_authorized:true, reason_code:'mandate_scope_satisfied' };
}
