import { ValidationError, assertPlainObject, assertString, assertStringArray } from './canonical.mjs';

export const FEDERATED_RECOGNITION_SCHEMA = 'axiom-federated-recognition-view.v1';
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST=/^[a-f0-9]{64}$/;

function exact(raw,fields,label){
  const v=assertPlainObject(raw,label), allowed=new Set(fields);
  for(const k of Object.keys(v)) if(!allowed.has(k)) throw new ValidationError(`${label} contains unsupported field ${k}`);
  for(const k of fields) if(!Object.hasOwn(v,k)) throw new ValidationError(`${label} is missing required field ${k}`);
  return v;
}
function id(v,l){return assertString(v,l,{min:1,max:192,pattern:ID});}
function digest(v,l){return assertString(v,l,{min:64,max:64,pattern:DIGEST});}

export function validateFederatedRecognitionView(raw){
  const v=exact(raw,['schema','view_id','local_party','edges','candidate_paths','adopted_edge_digests','authority','limitations'],'federated recognition view');
  if(v.schema!==FEDERATED_RECOGNITION_SCHEMA) throw new ValidationError('federated recognition schema is invalid');
  id(v.view_id,'view_id');
  const local=id(v.local_party,'local_party');

  if(!Array.isArray(v.edges)||v.edges.length===0||v.edges.length>512) throw new ValidationError('edges must contain 1-512 entries');
  const edgeDigests=new Set();
  for(const [i,eRaw] of v.edges.entries()){
    const e=exact(eRaw,['edge_digest','party_a','party_b','active','purposes','privacy_constraints','assurance_profile_refs'],`edges[${i}]`);
    const d=digest(e.edge_digest,`edges[${i}].edge_digest`);
    if(edgeDigests.has(d)) throw new ValidationError('edge digests must be unique');
    edgeDigests.add(d);
    const a=id(e.party_a,`edges[${i}].party_a`), b=id(e.party_b,`edges[${i}].party_b`);
    if(a===b) throw new ValidationError('edge parties must differ');
    if(typeof e.active!=='boolean') throw new ValidationError('edge active must be boolean');
    const purposes=assertStringArray(e.purposes,`edges[${i}].purposes`,{maxItems:64,itemMax:192});
    if(purposes.length===0) throw new ValidationError('edge requires purposes');
    assertStringArray(e.privacy_constraints,`edges[${i}].privacy_constraints`,{maxItems:64,itemMax:512});
    assertStringArray(e.assurance_profile_refs,`edges[${i}].assurance_profile_refs`,{maxItems:64,itemMax:512});
  }

  const adopted=assertStringArray(v.adopted_edge_digests,'adopted_edge_digests',{maxItems:512,itemMax:64});
  for(const [i,d] of adopted.entries()){
    digest(d,`adopted_edge_digests[${i}]`);
    if(!edgeDigests.has(d)) throw new ValidationError('adopted edge must exist in view');
  }

  if(!Array.isArray(v.candidate_paths)||v.candidate_paths.length>512) throw new ValidationError('candidate_paths must be an array');
  for(const [i,pRaw] of v.candidate_paths.entries()){
    const p=exact(pRaw,['path_id','nodes','edge_digests','purpose','status','may_satisfy_local_recognition'],`candidate_paths[${i}]`);
    id(p.path_id,`candidate_paths[${i}].path_id`);
    const nodes=assertStringArray(p.nodes,`candidate_paths[${i}].nodes`,{maxItems:64,itemMax:192});
    if(nodes.length<2) throw new ValidationError('candidate path requires at least two nodes');
    for(const [j,n] of nodes.entries()) id(n,`candidate_paths[${i}].nodes[${j}]`);
    const edges=assertStringArray(p.edge_digests,`candidate_paths[${i}].edge_digests`,{maxItems:63,itemMax:64});
    if(edges.length!==nodes.length-1) throw new ValidationError('candidate path edge count must equal nodes minus one');
    for(const [j,d] of edges.entries()) digest(d,`candidate_paths[${i}].edge_digests[${j}]`);
    id(p.purpose,`candidate_paths[${i}].purpose`);
    id(p.status,`candidate_paths[${i}].status`);
    if(p.may_satisfy_local_recognition!==false) throw new ValidationError('candidate path may not satisfy local recognition automatically');
  }

  const authority=exact(v.authority,['path_grants_trust','path_grants_authority','set_membership_grants_recognition'],'authority');
  for(const [k,val] of Object.entries(authority)) if(val!==false) throw new ValidationError(`authority.${k} must be false`);

  const limits=assertStringArray(v.limitations,'limitations',{maxItems:64,itemMax:1024});
  if(limits.length===0) throw new ValidationError('federated recognition view must declare limitations');

  return Object.freeze({
    valid:true,
    local_party:local,
    adopted_edge_count:adopted.length,
    candidate_path_count:v.candidate_paths.length,
    authority_effect:'none',
    automatic_transitive_trust:false
  });
}
