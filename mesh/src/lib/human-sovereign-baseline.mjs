import { digestObject, ValidationError } from './canonical.mjs';

export const HUMAN_SOVEREIGN_BASELINE_SCHEMA = 'axiom-human-sovereign-baseline.v0';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const REQUIRED_TRUE = [
  'direct_identity_access','direct_inspection','direct_consent','direct_refusal','direct_revocation','direct_recovery','direct_export','direct_authority_review','counterpart_optional','counterpart_absence_preserves_human_principal','counterpart_disagreement_cannot_revoke_human_authority','counterpart_agreement_cannot_widen_human_authority','counterpart_state_not_required_for_root_identity','direct_operation_preserves_policy_checks'
];

export function validateHumanSovereignBaseline(document) {
  validateShape(document);
  return Object.freeze({ valid:true, schema:document.schema, baseline_id:document.baseline_id, human_principal_id:document.human_principal_id, node_ref:document.node_ref, baseline_digest:digestObject(document), authority_effect:'none', network_effect:'none', runtime_activation:false });
}
export function humanSovereignBaselineDigest(document) { validateShape(document); return digestObject(document); }

function validateShape(document) {
  exactObject(document, 'Human sovereign baseline', ['schema','version','status','baseline_id','human_principal_id','node_ref',...REQUIRED_TRUE,'created_at','updated_at','authority_effect','network_effect','runtime_activation']);
  if (document.schema !== HUMAN_SOVEREIGN_BASELINE_SCHEMA || document.version !== 0 || document.status !== 'inert-contract-laboratory') throw new ValidationError('Human sovereign baseline schema/version/status is invalid');
  id(document.baseline_id,'baseline_id'); id(document.human_principal_id,'human_principal_id'); id(document.node_ref,'node_ref');
  for (const key of REQUIRED_TRUE) if (document[key] !== true) throw new ValidationError(`${key} must remain true in the Human Sovereign Baseline`);
  const created=date(document.created_at,'created_at'); const updated=date(document.updated_at,'updated_at'); if (updated < created) throw new ValidationError('updated_at cannot precede created_at');
  if (document.authority_effect !== 'none' || document.network_effect !== 'none' || document.runtime_activation !== false) throw new ValidationError('Human sovereign baseline activation boundary is invalid');
}
function exactObject(value,label,fields){if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError(`${label} must be an object`);const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)throw new ValidationError(`${label} must be a plain object`);const allowed=new Set(fields);for(const key of Object.keys(value))if(!allowed.has(key))throw new ValidationError(`${label} contains unknown field ${key}`);for(const key of fields)if(!Object.hasOwn(value,key))throw new ValidationError(`${label} is missing required field ${key}`);}
function id(value,label){if(typeof value!=='string'||!IDENTIFIER.test(value))throw new ValidationError(`${label} is invalid`);return value;}
function date(value,label){if(typeof value!=='string'||value.length>64)throw new ValidationError(`${label} must be a canonical ISO timestamp`);const parsed=new Date(value);if(!Number.isFinite(parsed.getTime())||parsed.toISOString()!==value)throw new ValidationError(`${label} must be a canonical ISO timestamp`);return parsed.getTime();}
