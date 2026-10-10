import { digestObject, ValidationError } from './canonical.mjs';

export const COMMAND_INTAKE_ENVELOPE_SCHEMA='axiom-command-intake-envelope.v0';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const CHANNELS=new Set(['web','voice','messaging','email','cli','wearable','device','api','other']);

export function validateCommandIntakeEnvelope(document){
  exactObject(document,'Command intake envelope',[
    'schema','version','status','command_id','channel_kind','channel_binding_ref',
    'claimed_principal_ref','authenticated_principal_ref','authentication_evidence_ref',
    'payload_ref','payload_digest','received_at','expires_at','replay_nonce',
    'channel_is_authority','grants_authority','execution_effect','runtime_activation'
  ]);
  if(
    document.schema!==COMMAND_INTAKE_ENVELOPE_SCHEMA||document.version!==0
    ||document.status!=='inert-proposal-envelope'||document.channel_is_authority!==false
    ||document.grants_authority!==false||document.execution_effect!=='none'
    ||document.runtime_activation!==false
  )throw new ValidationError('Command intake authority boundary is invalid');
  id(document.command_id,'command_id');
  if(!CHANNELS.has(document.channel_kind))throw new ValidationError('channel_kind is invalid');
  id(document.channel_binding_ref,'channel_binding_ref');
  nullableId(document.claimed_principal_ref,'claimed_principal_ref');
  nullableId(document.authenticated_principal_ref,'authenticated_principal_ref');
  nullableRef(document.authentication_evidence_ref,'authentication_evidence_ref');
  ref(document.payload_ref,'payload_ref');digest(document.payload_digest,'payload_digest');
  const received=canonicalDate(document.received_at,'received_at');
  const expires=canonicalDate(document.expires_at,'expires_at');
  if(expires<=received)throw new ValidationError('expires_at must follow received_at');
  id(document.replay_nonce,'replay_nonce');
  if(document.authenticated_principal_ref!==null&&document.authentication_evidence_ref===null){
    throw new ValidationError('authenticated principal requires authentication_evidence_ref');
  }
  return Object.freeze({valid:true,schema:document.schema,command_id:document.command_id,envelope_digest:digestObject(document),authority_effect:'none',execution_effect:'none',runtime_activation:false});
}

export function commandIntakeEnvelopeDigest(document){validateCommandIntakeEnvelope(document);return digestObject(document);}

export function evaluateCommandIntake(document,current){
  validateCommandIntakeEnvelope(document);
  exactObject(current,'Command intake current state',[
    'assessed_at','expected_channel_binding_ref','channel_binding_current',
    'authenticated_principal_ref','authentication_evidence_ref',
    'authenticated_principal_current','replay_nonce_seen'
  ]);
  const assessed=canonicalDate(current.assessed_at,'assessed_at');
  id(current.expected_channel_binding_ref,'expected_channel_binding_ref');
  nullableId(current.authenticated_principal_ref,'authenticated_principal_ref');
  nullableRef(current.authentication_evidence_ref,'authentication_evidence_ref');
  if(typeof current.channel_binding_current!=='boolean'||typeof current.authenticated_principal_current!=='boolean'||typeof current.replay_nonce_seen!=='boolean'){
    throw new ValidationError('Command intake currentness/replay flags must be boolean');
  }
  const reasons=[];
  if(assessed<canonicalDate(document.received_at,'received_at'))reasons.push('command-not-yet-valid');
  if(assessed>=canonicalDate(document.expires_at,'expires_at'))reasons.push('command-expired');
  if(document.channel_binding_ref!==current.expected_channel_binding_ref)reasons.push('channel-binding-mismatch');
  if(current.channel_binding_current!==true)reasons.push('channel-binding-not-current');
  if(current.replay_nonce_seen)reasons.push('replay-detected');
  if(document.authenticated_principal_ref===null)reasons.push('principal-not-authenticated');
  if(document.authenticated_principal_ref!==current.authenticated_principal_ref)reasons.push('authenticated-principal-mismatch');
  if(document.authentication_evidence_ref!==current.authentication_evidence_ref)reasons.push('authentication-evidence-mismatch');
  if(document.authenticated_principal_ref!==null&&current.authenticated_principal_current!==true)reasons.push('principal-authentication-not-current');
  if(
    document.claimed_principal_ref!==null&&document.authenticated_principal_ref!==null
    &&document.claimed_principal_ref!==document.authenticated_principal_ref
  )reasons.push('claimed-principal-mismatch');
  return Object.freeze({
    intake_eligible:reasons.length===0,
    reasons:Object.freeze(reasons),
    command_id:document.command_id,
    channel_kind:document.channel_kind,
    authenticated_principal_ref:document.authenticated_principal_ref,
    payload_ref:document.payload_ref,
    payload_digest:document.payload_digest,
    intake_effect:'proposal-only',
    authority_effect:'none',
    execution_effect:'none',
    runtime_activation:false
  });
}

function exactObject(v,l,f){if(!v||typeof v!=='object'||Array.isArray(v))throw new ValidationError(l+' must be an object');if(Object.keys(v).sort().join(',')!==[...f].sort().join(','))throw new ValidationError(l+' fields are invalid');}
function id(v,l){if(typeof v!=='string'||!ID.test(v))throw new ValidationError(l+' is invalid');}
function nullableId(v,l){if(v===null)return null;id(v,l);return v;}
function digest(v,l){if(typeof v!=='string'||!DIGEST.test(v))throw new ValidationError(l+' must be a lowercase sha256 digest');}
function ref(v,l){if(typeof v!=='string'||v.length<1||v.length>1024)throw new ValidationError(l+' is invalid');}
function nullableRef(v,l){if(v===null)return null;ref(v,l);return v;}
function canonicalDate(v,l){if(typeof v!=='string'||v.length>64)throw new ValidationError(l+' must be a canonical ISO timestamp');const d=new Date(v);if(!Number.isFinite(d.getTime())||d.toISOString()!==v)throw new ValidationError(l+' must be a canonical ISO timestamp');return d.getTime();}
