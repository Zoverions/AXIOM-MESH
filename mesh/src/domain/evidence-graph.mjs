import { ValidationError, assertString } from '../lib/canonical.mjs';
import { assertAuthorityNeutral, assertEnum, assertIsoTimestamp, assertNoUnknownKeys, assertReference, assertUniqueStrings } from './sovereign-information-common.mjs';

export const EVIDENCE_ASSERTION_SCHEMA = 'axiom-evidence-assertion.v1';
export const EVIDENCE_LINK_SCHEMA = 'axiom-evidence-link.v1';
export const EVIDENCE_REVIEW_SCHEMA = 'axiom-evidence-review-state.v1';

const NODE_TYPES = new Set(['observation','assertion','inference','hypothesis','evidence-item','counterevidence','source','alternative-explanation','unknown','missing-evidence','challenge','correction','supersession','review','adjudication','decision-use']);
const STATES = new Set(['asserted','corroborated','disputed','superseded','adjudicated-for-defined-purpose','indeterminate','withdrawn']);
const RELATIONS = new Set(['supports','contradicts','weakens','corroborates','derived-from','observed-by','asserted-by','reviewed-by','relied-upon-by','challenged-by','corrected-by','superseded-by','alternative-to','missing-from','produced-by','disclosed-to','sealed-under','adjudicated-by']);
const ASSERTION_KEYS = new Set(['schema','assertion_id','type','proposition','source_ref','epistemic_state','purpose_scope','provenance_refs','created_at']);
const LINK_KEYS = new Set(['schema','link_id','from_ref','to_ref','relation','asserted_by','created_at']);
const REVIEW_KEYS = new Set(['schema','object_ref','known','acquired','integrity_verified','indexed','machine_reviewed','human_reviewed','relied_upon','disclosed','challenged','updated_at']);

function validateRefs(values, name) {
  for (const [index,value] of assertUniqueStrings(values,name).entries()) assertReference(value,`${name}[${index}]`);
}

export function validateEvidenceAssertion(assertion) {
  assertAuthorityNeutral(assertion,'evidence assertion');
  assertNoUnknownKeys(assertion,'evidence assertion',ASSERTION_KEYS);
  if (assertion.schema !== EVIDENCE_ASSERTION_SCHEMA) throw new ValidationError('evidence assertion has unsupported schema');
  assertReference(assertion.assertion_id,'assertion_id');
  assertEnum(assertion.type,'type',NODE_TYPES);
  assertString(assertion.proposition,'proposition',{max:8192});
  assertReference(assertion.source_ref,'source_ref');
  assertEnum(assertion.epistemic_state,'epistemic_state',STATES);
  assertUniqueStrings(assertion.purpose_scope,'purpose_scope',{min:1});
  validateRefs(assertion.provenance_refs,'provenance_refs');
  assertIsoTimestamp(assertion.created_at,'created_at');
  return assertion;
}

export function validateEvidenceLink(link) {
  assertAuthorityNeutral(link,'evidence link');
  assertNoUnknownKeys(link,'evidence link',LINK_KEYS);
  if (link.schema !== EVIDENCE_LINK_SCHEMA) throw new ValidationError('evidence link has unsupported schema');
  assertReference(link.link_id,'link_id');
  assertReference(link.from_ref,'from_ref');
  assertReference(link.to_ref,'to_ref');
  assertEnum(link.relation,'relation',RELATIONS);
  assertReference(link.asserted_by,'asserted_by');
  assertIsoTimestamp(link.created_at,'created_at');
  return link;
}

export function validateEvidenceReviewState(review) {
  assertAuthorityNeutral(review,'evidence review state');
  assertNoUnknownKeys(review,'evidence review state',REVIEW_KEYS);
  if (review.schema !== EVIDENCE_REVIEW_SCHEMA) throw new ValidationError('evidence review state has unsupported schema');
  assertReference(review.object_ref,'object_ref');
  for (const key of ['known','acquired','integrity_verified','indexed','machine_reviewed','human_reviewed','relied_upon','disclosed','challenged']) {
    if (typeof review[key] !== 'boolean') throw new ValidationError(`${key} must be boolean`);
  }
  assertIsoTimestamp(review.updated_at,'updated_at');
  return review;
}

export function buildEvidenceContext({assertions,links,focus_ids}) {
  if (!Array.isArray(assertions) || !Array.isArray(links)) throw new ValidationError('assertions and links must be arrays');
  const assertionIds = new Set();
  for (const assertion of assertions) {
    validateEvidenceAssertion(assertion);
    if (assertionIds.has(assertion.assertion_id)) throw new ValidationError(`duplicate assertion_id ${assertion.assertion_id}`);
    assertionIds.add(assertion.assertion_id);
  }
  const linkIds = new Set();
  for (const link of links) {
    validateEvidenceLink(link);
    if (linkIds.has(link.link_id)) throw new ValidationError(`duplicate link_id ${link.link_id}`);
    linkIds.add(link.link_id);
    if (!assertionIds.has(link.from_ref) || !assertionIds.has(link.to_ref)) throw new ValidationError('evidence link endpoint is missing from assertions');
  }
  const included = new Set(assertUniqueStrings(focus_ids,'focus_ids',{min:1}));
  for (const id of included) if (!assertionIds.has(id)) throw new ValidationError(`unknown focus_id ${id}`);
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of links) {
      if (included.has(link.from_ref) || included.has(link.to_ref)) {
        if (!included.has(link.from_ref)) { included.add(link.from_ref); changed = true; }
        if (!included.has(link.to_ref)) { included.add(link.to_ref); changed = true; }
      }
    }
  }
  return {
    assertions: assertions.filter(item=>included.has(item.assertion_id)),
    links: links.filter(item=>included.has(item.from_ref) && included.has(item.to_ref))
  };
}
