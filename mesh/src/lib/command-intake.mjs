import { digestObject, ValidationError } from './canonical.mjs';

export const COMMAND_INTAKE_SCHEMA='axiom-command-intake.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const CHANNELS=new Set(["web","voice","messaging","cli","wearable","device","api","runtime"]);
const CONTENT_TYPES=new Set(['text','transcript','structured-command']);

export function validateCommandIntake(document){
  exactObject(document,'Command intake',[
    'schema','version','status','command_id','channel_kind','channel_instance_ref',
    'channel_binding_ref','claimed_principal_id','content_digest','content_type',
    'normalized_text','data_classes','received_at','expires_at','nonce',
    'authentication_evidence_refs','channel_identity_authority','grants_authority',
    'execution_effect','runtime_activation'
  ]);
  if(
    document.schema!==COMMAND_INTAKE_SCHEMA||document.version!==0
    ||document.status!=='inert-intake-laboratory'
    ||document.channel_identity_authority!==false||document.grants_authority!==false
    ||document.execution_effect!=='none'||document.runtime_activation!==false
  )throw new ValidationError('Command intake authority boundary is invalid');

  id(document.command_id,'command_id');
  if(!CHANNELS.has(document.channel_kind))throw new ValidationError('channel_kind is invalid');
  id(document.channel_instance_ref,'channel_instance_ref');
  id(document.channel_binding_ref,'channel_binding_ref');
  if(document.claimed_principal_id!==null)id(document.claimed_principal_id,'claimed_principal_id');
  digest(document.content_digest,'content_digest');
  if(!CONTENT_TYPES.has(document.content_type))throw new ValidationError('content_type is invalid');
  text(document.normalized_text,'normalized_text',1,12000);
  textArray(document.data_classes,'data_classes',64,512);
  const received=canonicalDate(document.received_at,'received_at');
  const expires=canonicalDate(document.expires_at,'expires_at');
  if(expires<=received)throw new ValidationError('expires_at must follow received_at');
  text(document.nonce,'nonce',16,256);
  refArray(document.authentication_evidence_refs,'authentication_evidence_refs',1,64,512);
  return Object.freeze({
    valid:true,schema:document.schema,command_id:document.command_id,
    intake_digest:digestObject(document),identity_effect:'none',
    authority_effect:'none',execution_effect:'none',runtime_activation:false
  });
}

export function commandIntakeDigest(document){validateCommandIntake(document);return digestObject(document);}

export function assessCommandIntake(document,current){
  validateCommandIntake(document);
  exactObject(current,'Command intake current state',[
    'resolved_principal_id','channel_binding_ref','channel_binding_current',
    'authentication_current','replay_seen','assessed_at'
  ]);
  id(current.resolved_principal_id,'resolved_principal_id');
  id(current.channel_binding_ref,'current channel_binding_ref');
  if(typeof current.channel_binding_current!=='boolean'||typeof current.authentication_current!=='boolean'||typeof current.replay_seen!=='boolean'){
    throw new ValidationError('Command intake currentness flags must be boolean');
  }
  const assessed=canonicalDate(current.assessed_at,'assessed_at');
  const received=canonicalDate(document.received_at,'received_at');
  const expires=canonicalDate(document.expires_at,'expires_at');
  const reasons=[];
  if(assessed<received)reasons.push('assessed-before-receipt');
  if(assessed>=expires)reasons.push('command-expired');
  if(current.channel_binding_ref!==document.channel_binding_ref)reasons.push('channel-binding-mismatch');
  if(current.channel_binding_current!==true)reasons.push('channel-binding-not-current');
  if(current.authentication_current!==true)reasons.push('authentication-not-current');
  if(current.replay_seen===true)reasons.push('replay-detected');
  if(document.claimed_principal_id!==null&&document.claimed_principal_id!==current.resolved_principal_id){
    reasons.push('principal-claim-mismatch');
  }
  return Object.freeze({
    admitted_to_intent_pipeline:reasons.length===0,
    resolved_principal_id:current.resolved_principal_id,
    command_digest:digestObject(document),
    reasons:Object.freeze(reasons),
    identity_effect:'none',authority_effect:'none',execution_effect:'none'
  });
}

function exactObject(value,label,fields){if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError(label+' must be an object');const a=Object.keys(value).sort().join(',');const e=[...fields].sort().join(',');if(a!==e)throw new ValidationError(label+' fields are invalid');}
function id(value,label){if(typeof value!=='string'||!ID.test(value))throw new ValidationError(label+' is invalid');}
function digest(value,label){if(typeof value!=='string'||!DIGEST.test(value))throw new ValidationError(label+' must be a lowercase sha256 digest');}
function text(value,label,min,max){if(typeof value!=='string'||value.trim().length<min||value.length>max)throw new ValidationError(label+' has invalid length');if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new ValidationError(label+' contains control characters');}
function textArray(value,label,max,itemMax){if(!Array.isArray(value)||value.length>max)throw new ValidationError(label+' is invalid');const s=new Set();for(const item of value){text(item,label+' item',1,itemMax);if(s.has(item))throw new ValidationError(label+' contains duplicate values');s.add(item);}}
function refArray(value,label,min,max,itemMax){if(!Array.isArray(value)||value.length<min||value.length>max)throw new ValidationError(label+' is invalid');const s=new Set();for(const item of value){text(item,label+' item',1,itemMax);if(s.has(item))throw new ValidationError(label+' contains duplicate values');s.add(item);}}
function canonicalDate(value,label){if(typeof value!=='string'||value.length>64)throw new ValidationError(label+' must be a canonical ISO timestamp');const d=new Date(value);if(!Number.isFinite(d.getTime())||d.toISOString()!==value)throw new ValidationError(label+' must be a canonical ISO timestamp');return d.getTime();}
