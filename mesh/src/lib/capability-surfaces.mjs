import { digestObject, ValidationError } from './canonical.mjs';

export const CAPABILITY_SURFACES_SCHEMA = 'axiom-capability-surfaces.v0';
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const LIFECYCLES=new Set(['conceptual','specified','implemented','tested','enabled','exposed','pilot-proven','production-promoted','marketed']);
const PRE_EXECUTABLE=new Set(['conceptual','specified']);

export function validateCapabilitySurfaceRegistry(document){
  validateShape(document);
  return Object.freeze({
    valid:true,
    schema:document.schema,
    registry_id:document.registry_id,
    entry_count:document.entries.length,
    registry_digest:digestObject(document),
    discovery_grants_authority:false,
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

export function capabilitySurfacesDigest(document){ validateShape(document); return digestObject(document); }

function validateShape(document){
  exactObject(document,'Capability surface registry',['schema','version','status','registry_id','executable_registry_ref','discovery_grants_authority','entries','created_at','authority_effect','network_effect','runtime_activation']);
  if(document.schema!==CAPABILITY_SURFACES_SCHEMA||document.version!==0||document.status!=='inert-contract-laboratory') throw new ValidationError('Capability surface registry schema/version/status is invalid');
  id(document.registry_id,'registry_id');
  if(document.executable_registry_ref!=='mesh/config/capabilities.json') throw new ValidationError('executable_registry_ref is invalid');
  if(document.discovery_grants_authority!==false) throw new ValidationError('Capability discovery must not grant authority');
  if(!Array.isArray(document.entries)||document.entries.length<1||document.entries.length>128) throw new ValidationError('entries must contain 1-128 items');
  const seen=new Set();
  for(const entry of document.entries){ validateEntry(entry); if(seen.has(entry.capability_id)) throw new ValidationError(`entries contains duplicate capability_id ${entry.capability_id}`); seen.add(entry.capability_id); }
  date(document.created_at,'created_at');
  if(document.authority_effect!=='none'||document.network_effect!=='none'||document.runtime_activation!==false) throw new ValidationError('Capability surface registry activation boundary is invalid');
  return document;
}

function validateEntry(entry){
  exactObject(entry,'Capability surface entry',['capability_id','lifecycle','human','machine','executable_capability_ref','evidence_refs','authority_boundary','non_claims']);
  id(entry.capability_id,'capability_id');
  if(!LIFECYCLES.has(entry.lifecycle)) throw new ValidationError('capability lifecycle is invalid');
  validateHuman(entry.human); validateMachine(entry.machine); uniqueIds(entry.evidence_refs,'evidence_refs',1,32);
  if(entry.authority_boundary!=='discovery-only-no-authority') throw new ValidationError('authority_boundary is invalid');
  stringArray(entry.non_claims,'non_claims',1,16,256);
  if(PRE_EXECUTABLE.has(entry.lifecycle)){
    if(entry.executable_capability_ref!==null) throw new ValidationError(`${entry.lifecycle} capability surface cannot imply executable capability`);
  } else {
    if(entry.executable_capability_ref===null) throw new ValidationError('post-specified lifecycle requires executable capability reference');
    id(entry.executable_capability_ref,'executable_capability_ref');
    if(entry.evidence_refs.length<1) throw new ValidationError('post-specified lifecycle requires evidence');
  }
}
function validateHuman(value){ exactObject(value,'Human capability surface',['product','section','label','description']); text(value.product,'product',1,128); text(value.section,'section',1,128); text(value.label,'label',1,128); text(value.description,'description',1,1024); }
function validateMachine(value){ exactObject(value,'Machine capability surface',['schema_ids','read_surfaces','action_surfaces']); uniqueIds(value.schema_ids,'schema_ids',0,16); uniqueIds(value.read_surfaces,'read_surfaces',0,32); uniqueIds(value.action_surfaces,'action_surfaces',0,32); }
function exactObject(v,l,fields){ if(!v||typeof v!=='object'||Array.isArray(v)) throw new ValidationError(`${l} must be an object`); const p=Object.getPrototypeOf(v); if(p!==Object.prototype&&p!==null) throw new ValidationError(`${l} must be a plain object`); const a=new Set(fields); for(const k of Object.keys(v)) if(!a.has(k)) throw new ValidationError(`${l} contains unknown field ${k}`); for(const k of fields) if(!Object.hasOwn(v,k)) throw new ValidationError(`${l} is missing required field ${k}`); }
function id(v,l){ if(typeof v!=='string'||!IDENTIFIER.test(v)) throw new ValidationError(`${l} is invalid`); return v; }
function text(v,l,min,max){ if(typeof v!=='string'||v.length<min||v.length>max) throw new ValidationError(`${l} must contain ${min}-${max} characters`); return v; }
function uniqueIds(v,l,min,max){ if(!Array.isArray(v)||v.length<min||v.length>max) throw new ValidationError(`${l} must contain ${min}-${max} items`); const seen=new Set(); for(const i of v){ id(i,l); if(seen.has(i)) throw new ValidationError(`${l} contains duplicate ${i}`); seen.add(i); } }
function stringArray(v,l,min,max,itemMax){ if(!Array.isArray(v)||v.length<min||v.length>max) throw new ValidationError(`${l} must contain ${min}-${max} items`); const seen=new Set(); for(const i of v){ text(i,l,1,itemMax); if(seen.has(i)) throw new ValidationError(`${l} contains duplicate ${i}`); seen.add(i); } }
function date(v,l){ if(typeof v!=='string'||v.length>64) throw new ValidationError(`${l} must be a canonical ISO timestamp`); const d=new Date(v); if(!Number.isFinite(d.getTime())||d.toISOString()!==v) throw new ValidationError(`${l} must be a canonical ISO timestamp`); }
