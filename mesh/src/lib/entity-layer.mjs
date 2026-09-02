import { digestObject, ValidationError } from './canonical.mjs';

export const ENTITY_LAYER_SCHEMA = 'axiom-entity-layer.v0';
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const LAYER_CLASSES=new Set(['constitution','worldview','judgment','disposition','culture','domain','skill','relationship','personal-grounding','presentation','self-authored']);
const ENDORSEMENTS=new Set(['none','human','entity','joint','governance']);
const PRIVACY=new Set(['public','shared','private','sealed']);
const MUTABILITY=new Set(['immutable','replaceable','evolvable','ephemeral']);
const INFLUENCE=new Set(['reasoning-guidance','judgment-heuristic','conversation-disposition','retrieval-preference','presentation','domain-workflow','relationship-expectation']);

export function validateEntityLayer(document){
  validateShape(document);
  return Object.freeze({valid:true,schema:document.schema,layer_id:document.layer_id,layer_class:document.layer_class,layer_digest:digestObject(document),privacy_class:document.privacy_class,mutability:document.mutability,authority_effect:'none',network_effect:'none',runtime_activation:false});
}

export function entityLayerDigest(document){
  validateShape(document);
  return digestObject(document);
}

function validateShape(document){
  exactObject(document,'Entity layer',['schema','version','status','layer_id','layer_version','layer_class','artifact_ref','artifact_digest','authors','adopter_principal_id','endorsement_mode','provenance_refs','influence_scopes','privacy_class','mutability','dependencies','conflicts','predecessor_layer_ref','created_at','adopted_at','expires_at','contains_raw_private_content','authority_effect','network_effect','runtime_activation']);
  if(document.schema!==ENTITY_LAYER_SCHEMA||document.version!==0||document.status!=='inert-contract-laboratory') throw new ValidationError('Entity layer schema/version/status is invalid');
  id(document.layer_id,'layer_id');
  if(!Number.isInteger(document.layer_version)||document.layer_version<0) throw new ValidationError('layer_version is invalid');
  enumValue(document.layer_class,'layer_class',LAYER_CLASSES);
  id(document.artifact_ref,'artifact_ref');
  if(typeof document.artifact_digest!=='string'||!DIGEST.test(document.artifact_digest)) throw new ValidationError('artifact_digest is invalid');
  uniqueIds(document.authors,'authors',1,16);
  id(document.adopter_principal_id,'adopter_principal_id');
  enumValue(document.endorsement_mode,'endorsement_mode',ENDORSEMENTS);
  uniqueIds(document.provenance_refs,'provenance_refs',0,32);
  uniqueEnum(document.influence_scopes,'influence_scopes',INFLUENCE,1,16);
  enumValue(document.privacy_class,'privacy_class',PRIVACY);
  enumValue(document.mutability,'mutability',MUTABILITY);
  uniqueIds(document.dependencies,'dependencies',0,16);
  uniqueIds(document.conflicts,'conflicts',0,16);
  nullableId(document.predecessor_layer_ref,'predecessor_layer_ref');
  if(document.dependencies.includes(document.layer_id)||document.conflicts.includes(document.layer_id)) throw new ValidationError('Entity layer cannot self-reference in dependencies or conflicts');
  for(const dep of document.dependencies) if(document.conflicts.includes(dep)) throw new ValidationError('Entity layer dependency/conflict overlap is invalid');
  if(document.layer_class==='personal-grounding'&&!['private','sealed'].includes(document.privacy_class)) throw new ValidationError('personal-grounding layers must be private or sealed');
  const created=date(document.created_at,'created_at');
  const adopted=date(document.adopted_at,'adopted_at');
  if(adopted<created) throw new ValidationError('adopted_at cannot precede created_at');
  if(document.mutability==='ephemeral'){
    if(document.expires_at===null) throw new ValidationError('ephemeral layer expires_at is required');
    const expires=date(document.expires_at,'expires_at');
    if(expires<=adopted) throw new ValidationError('expires_at must follow adopted_at');
  } else if(document.expires_at!==null) throw new ValidationError('durable layers must use null expires_at');
  if(document.contains_raw_private_content!==false) throw new ValidationError('Entity layer composition metadata cannot contain raw private content');
  if(document.authority_effect!=='none'||document.network_effect!=='none'||document.runtime_activation!==false) throw new ValidationError('Entity layer activation boundary is invalid');
  return document;
}

function exactObject(v,l,fields){
  if(!v||typeof v!=='object'||Array.isArray(v)) throw new ValidationError(`${l} must be an object`);
  const p=Object.getPrototypeOf(v); if(p!==Object.prototype&&p!==null) throw new ValidationError(`${l} must be a plain object`);
  const a=new Set(fields);
  for(const k of Object.keys(v)) if(!a.has(k)) throw new ValidationError(`${l} contains unknown field ${k}`);
  for(const k of fields) if(!Object.hasOwn(v,k)) throw new ValidationError(`${l} is missing required field ${k}`);
}
function id(v,l){ if(typeof v!=='string'||!IDENTIFIER.test(v)) throw new ValidationError(`${l} is invalid`); return v; }
function nullableId(v,l){ if(v===null) return null; return id(v,l); }
function enumValue(v,l,s){ if(typeof v!=='string'||!s.has(v)) throw new ValidationError(`${l} is invalid`); }
function uniqueIds(v,l,min,max){ if(!Array.isArray(v)||v.length<min||v.length>max) throw new ValidationError(`${l} must contain ${min}-${max} items`); const seen=new Set(); for(const i of v){ id(i,l); if(seen.has(i)) throw new ValidationError(`${l} contains duplicate ${i}`); seen.add(i); } }
function uniqueEnum(v,l,set,min,max){ if(!Array.isArray(v)||v.length<min||v.length>max) throw new ValidationError(`${l} must contain ${min}-${max} items`); const seen=new Set(); for(const i of v){ enumValue(i,l,set); if(seen.has(i)) throw new ValidationError(`${l} contains duplicate ${i}`); seen.add(i); } }
function date(v,l){ if(typeof v!=='string'||v.length>64) throw new ValidationError(`${l} must be a canonical ISO timestamp`); const d=new Date(v); if(!Number.isFinite(d.getTime())||d.toISOString()!==v) throw new ValidationError(`${l} must be a canonical ISO timestamp`); return d.getTime(); }
