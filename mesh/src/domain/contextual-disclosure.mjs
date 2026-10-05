import { ValidationError, assertPlainObject, assertString } from '../lib/canonical.mjs';
import { assertAuthorityNeutral, assertEnum, assertIsoTimestamp, assertNoUnknownKeys, assertReference, assertUniqueStrings } from './sovereign-information-common.mjs';

export const CONTEXTUAL_DISCLOSURE_REQUEST_SCHEMA = 'axiom-contextual-disclosure-request.v1';
export const CONTEXTUAL_DISCLOSURE_RESULT_SCHEMA = 'axiom-contextual-disclosure-result.v1';

const REQUEST_KEYS = new Set(['schema','request_id','requester','subject_ref','purpose','required_claims','requested_fields','verifier_policy_ref','created_at']);
const CLAIM_KEYS = new Set(['claim_id','predicate','value','evidence_refs','derived_from_fields']);
const POLICY_KEYS = new Set(['allowed_claims','allowed_raw_fields','required_authority_ref']);
const RESULT_KEYS = new Set(['schema','request_id','status','selected_claim_ids','disclosed_fields','withheld_fields','authority_ref','reason_codes']);
const RESULT_STATUS = new Set(['satisfied','partial','escalation','denied']);

function validateFieldNames(values,name) { return assertUniqueStrings(values,name,{maxItems:128,itemMax:128}); }
function validateClaim(claim) {
  assertAuthorityNeutral(claim,'available claim');
  assertNoUnknownKeys(claim,'available claim',CLAIM_KEYS);
  assertReference(claim.claim_id,'claim_id');
  assertString(claim.predicate,'predicate',{max:256});
  if (typeof claim.value !== 'boolean') throw new ValidationError('claim value must be boolean in Slice 1');
  for (const [i,ref] of assertUniqueStrings(claim.evidence_refs,'evidence_refs',{min:1}).entries()) assertReference(ref,`evidence_refs[${i}]`);
  validateFieldNames(claim.derived_from_fields,'derived_from_fields');
  return claim;
}
function validatePolicy(policy) {
  assertPlainObject(policy,'projection policy');
  assertNoUnknownKeys(policy,'projection policy',POLICY_KEYS);
  assertUniqueStrings(policy.allowed_claims,'allowed_claims');
  validateFieldNames(policy.allowed_raw_fields,'allowed_raw_fields');
  assertReference(policy.required_authority_ref,'required_authority_ref');
  return policy;
}

export function validateContextualDisclosureRequest(request) {
  assertAuthorityNeutral(request,'contextual disclosure request');
  assertNoUnknownKeys(request,'contextual disclosure request',REQUEST_KEYS);
  if (request.schema !== CONTEXTUAL_DISCLOSURE_REQUEST_SCHEMA) throw new ValidationError('contextual disclosure request has unsupported schema');
  assertReference(request.request_id,'request_id');
  assertReference(request.requester,'requester');
  assertReference(request.subject_ref,'subject_ref');
  assertString(request.purpose,'purpose',{max:256});
  assertUniqueStrings(request.required_claims,'required_claims');
  validateFieldNames(request.requested_fields,'requested_fields');
  assertReference(request.verifier_policy_ref,'verifier_policy_ref');
  assertIsoTimestamp(request.created_at,'created_at');
  return request;
}

export function validateContextualDisclosureResult(result) {
  assertAuthorityNeutral(result,'contextual disclosure result');
  assertNoUnknownKeys(result,'contextual disclosure result',RESULT_KEYS);
  if (result.schema !== CONTEXTUAL_DISCLOSURE_RESULT_SCHEMA) throw new ValidationError('contextual disclosure result has unsupported schema');
  assertReference(result.request_id,'request_id');
  assertEnum(result.status,'status',RESULT_STATUS);
  for (const [i,ref] of assertUniqueStrings(result.selected_claim_ids,'selected_claim_ids').entries()) assertReference(ref,`selected_claim_ids[${i}]`);
  assertPlainObject(result.disclosed_fields,'disclosed_fields');
  validateFieldNames(result.withheld_fields,'withheld_fields');
  assertReference(result.authority_ref,'authority_ref');
  assertUniqueStrings(result.reason_codes,'reason_codes');
  return result;
}

export function selectMinimumSufficientProjection({request,available_claims,available_fields,policy}) {
  validateContextualDisclosureRequest(request);
  if (!Array.isArray(available_claims)) throw new ValidationError('available_claims must be an array');
  const claimIds = new Set();
  const predicates = new Set();
  for (const claim of available_claims) {
    validateClaim(claim);
    if (claimIds.has(claim.claim_id)) throw new ValidationError(`duplicate claim_id ${claim.claim_id}`);
    if (predicates.has(claim.predicate)) throw new ValidationError(`duplicate predicate ${claim.predicate} is ambiguous`);
    claimIds.add(claim.claim_id);
    predicates.add(claim.predicate);
  }
  assertPlainObject(available_fields,'available_fields');
  validatePolicy(policy);

  const allowedClaims = new Set(policy.allowed_claims);
  const selected = [];
  let satisfiedCount = 0;
  for (const predicate of request.required_claims) {
    const claim = available_claims.find(item => item.predicate === predicate && item.value === true && allowedClaims.has(item.predicate));
    if (claim) { selected.push(claim.claim_id); satisfiedCount += 1; }
  }

  const allowedFields = new Set(policy.allowed_raw_fields);
  const disclosedEntries = [];
  const withheld_fields = [];
  const reasonCodes = new Set();
  for (const field of request.requested_fields) {
    if (!allowedFields.has(field)) {
      withheld_fields.push(field);
      reasonCodes.add('raw_field_not_authorized');
      continue;
    }
    if (!Object.hasOwn(available_fields,field)) {
      withheld_fields.push(field);
      reasonCodes.add('raw_field_unavailable');
      continue;
    }
    disclosedEntries.push([field, available_fields[field]]);
  }
  const disclosed_fields = Object.fromEntries(disclosedEntries);
  if (satisfiedCount < request.required_claims.length) reasonCodes.add('required_claim_unavailable');
  if (selected.length || withheld_fields.length) reasonCodes.add('minimum_sufficient_projection_applied');

  let status = 'satisfied';
  if (request.required_claims.length > 0 && satisfiedCount === 0) status = 'escalation';
  else if (satisfiedCount < request.required_claims.length) status = 'partial';

  return validateContextualDisclosureResult({
    schema: CONTEXTUAL_DISCLOSURE_RESULT_SCHEMA,
    request_id: request.request_id,
    status,
    selected_claim_ids: selected,
    disclosed_fields,
    withheld_fields,
    authority_ref: policy.required_authority_ref,
    reason_codes: [...reasonCodes]
  });
}
