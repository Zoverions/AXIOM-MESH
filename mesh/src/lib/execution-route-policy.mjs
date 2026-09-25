import { digestObject, ValidationError } from './canonical.mjs';

export const EXECUTION_ROUTE_POLICY_SCHEMA = 'axiom-execution-route-policy.v0';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ROUTE_ORDER = Object.freeze(["structured-api","mcp-tool","cli","semantic-ui","visual-computer-use"]);
const ROUTES = new Set(ROUTE_ORDER);
const EFFECTS = new Set(["none","read-external","write-external","publish-external","communication","financial","create-external-resource","delete-external-resource","physical","unknown"]);
const CONSEQUENCE = new Set(['C0','C1','C2','C3']);
const AVAILABILITY = new Set(['available','degraded','unavailable']);
const CURRENTNESS = new Set(['current','stale','unknown']);
const DETERMINISM = new Map([['high',0],['medium',1],['low',2]]);
const CONSEQUENTIAL_EFFECTS = new Set([
  'write-external','publish-external','communication','financial',
  'create-external-resource','delete-external-resource','physical','unknown'
]);

export function validateExecutionRoutePolicy(document) {
  exactObject(document, 'Execution route policy', [
    'schema','version','status','routing_id','outcome_id','task_id','operation_digest',
    'authority_snapshot_ref','effect_class','consequence_class','required_capabilities',
    'route_order','allow_visual_fallback','postcondition_required','reconciliation_required',
    'grants_authority','execution_effect','runtime_activation'
  ]);
  if (
    document.schema !== EXECUTION_ROUTE_POLICY_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-contract-laboratory'
    || document.grants_authority !== false
    || document.execution_effect !== 'none'
    || document.runtime_activation !== false
  ) throw new ValidationError('Execution route policy activation boundary is invalid');

  id(document.routing_id,'routing_id');
  id(document.outcome_id,'outcome_id');
  id(document.task_id,'task_id');
  digest(document.operation_digest,'operation_digest');
  id(document.authority_snapshot_ref,'authority_snapshot_ref');
  if (!EFFECTS.has(document.effect_class)) throw new ValidationError('effect_class is invalid');
  if (!CONSEQUENCE.has(document.consequence_class)) throw new ValidationError('consequence_class is invalid');
  idArray(document.required_capabilities,'required_capabilities',128);
  routeOrder(document.route_order);
  if (typeof document.allow_visual_fallback !== 'boolean') throw new ValidationError('allow_visual_fallback must be boolean');
  if (typeof document.postcondition_required !== 'boolean') throw new ValidationError('postcondition_required must be boolean');
  if (typeof document.reconciliation_required !== 'boolean') throw new ValidationError('reconciliation_required must be boolean');
  if (!document.allow_visual_fallback && document.route_order.includes('visual-computer-use')) {
    throw new ValidationError('visual-computer-use cannot appear when visual fallback is disabled');
  }
  if (
    CONSEQUENTIAL_EFFECTS.has(document.effect_class)
    && ['C2','C3'].includes(document.consequence_class)
    && (!document.postcondition_required || !document.reconciliation_required)
  ) {
    throw new ValidationError('C2/C3 consequential routing requires postcondition and reconciliation');
  }
  return Object.freeze({
    valid:true,
    schema:document.schema,
    routing_id:document.routing_id,
    policy_digest:digestObject(document),
    authority_effect:'none',
    execution_effect:'none',
    runtime_activation:false
  });
}

export function executionRoutePolicyDigest(document) {
  validateExecutionRoutePolicy(document);
  return digestObject(document);
}

export function evaluateExecutionRoutes(policy,candidates,{evaluatedAt}={}) {
  validateExecutionRoutePolicy(policy);
  const instant=canonicalDate(evaluatedAt,'evaluatedAt');
  if(!Array.isArray(candidates)||candidates.length>512) throw new ValidationError('Execution route candidates are invalid');
  const seen=new Set();
  const evaluations=candidates.map(candidate=>{
    validateCandidate(candidate);
    if(seen.has(candidate.route_id)) throw new ValidationError('Duplicate route_id: '+candidate.route_id);
    seen.add(candidate.route_id);
    return assess(policy,candidate,instant);
  });
  const eligible=evaluations.filter(x=>x.eligible).sort((a,b)=>compare(policy,a.candidate,b.candidate));
  const rejected=evaluations.filter(x=>!x.eligible).sort((a,b)=>a.candidate.route_id.localeCompare(b.candidate.route_id));
  return Object.freeze({
    schema:'axiom-execution-route-evaluation.v0',
    routing_id:policy.routing_id,
    operation_digest:policy.operation_digest,
    authority_snapshot_ref:policy.authority_snapshot_ref,
    evaluated_at:new Date(instant).toISOString(),
    preferred_route_candidate_id:eligible[0]?.candidate.route_id??null,
    eligible:Object.freeze(eligible.map((x,index)=>Object.freeze({rank:index+1,route_id:x.candidate.route_id,kind:x.candidate.kind}))),
    rejected:Object.freeze(rejected.map(x=>Object.freeze({route_id:x.candidate.route_id,reasons:Object.freeze([...x.reasons])}))),
    routing_effect:'none',
    grants_authority:false,
    execution_effect:'none',
    runtime_activation:false
  });
}

function assess(policy,candidate,instant){
  const reasons=[];
  const observed=canonicalDate(candidate.observed_at,'candidate observed_at');
  const expires=canonicalDate(candidate.expires_at,'candidate expires_at');
  if(candidate.availability==='unavailable') reasons.push('route-unavailable');
  if(candidate.currentness!=='current'||observed>instant||expires<=instant) reasons.push('route-not-current');
  if(candidate.operation_digest!==policy.operation_digest) reasons.push('operation-digest-mismatch');
  if(!policy.route_order.includes(candidate.kind)) reasons.push('route-kind-not-allowed');
  if(candidate.kind==='visual-computer-use'&&!policy.allow_visual_fallback) reasons.push('visual-fallback-disabled');
  subset(policy.required_capabilities,candidate.capabilities,'capability-missing',reasons);
  if(policy.postcondition_required&&!candidate.supports_postcondition) reasons.push('postcondition-unsupported');
  if(policy.reconciliation_required&&!candidate.supports_reconciliation) reasons.push('reconciliation-unsupported');
  if(candidate.kind==='visual-computer-use'&&(!candidate.supports_postcondition||!candidate.supports_reconciliation)){
    reasons.push('visual-fallback-insufficient-verification');
  }
  return {candidate,eligible:reasons.length===0,reasons};
}

function compare(policy,left,right){
  const routeDelta=policy.route_order.indexOf(left.kind)-policy.route_order.indexOf(right.kind);
  if(routeDelta!==0) return routeDelta;
  const deterministicDelta=DETERMINISM.get(left.determinism)-DETERMINISM.get(right.determinism);
  return deterministicDelta||left.route_id.localeCompare(right.route_id);
}

function validateCandidate(candidate){
  exactObject(candidate,'Execution route candidate',[
    'route_id','kind','operation_digest','capabilities','availability','currentness',
    'observed_at','expires_at','determinism','supports_postcondition',
    'supports_reconciliation','evidence_refs'
  ]);
  id(candidate.route_id,'route_id');
  if(!ROUTES.has(candidate.kind)) throw new ValidationError('route kind is invalid');
  digest(candidate.operation_digest,'candidate operation_digest');
  idArray(candidate.capabilities,'candidate capabilities',128);
  if(!AVAILABILITY.has(candidate.availability)) throw new ValidationError('route availability is invalid');
  if(!CURRENTNESS.has(candidate.currentness)) throw new ValidationError('route currentness is invalid');
  const observed=canonicalDate(candidate.observed_at,'candidate observed_at');
  const expires=canonicalDate(candidate.expires_at,'candidate expires_at');
  if(expires<=observed) throw new ValidationError('candidate expires_at must follow observed_at');
  if(!DETERMINISM.has(candidate.determinism)) throw new ValidationError('route determinism is invalid');
  if(typeof candidate.supports_postcondition!=='boolean'||typeof candidate.supports_reconciliation!=='boolean'){
    throw new ValidationError('route verification support flags must be boolean');
  }
  textArray(candidate.evidence_refs,'candidate evidence_refs',1,128,512);
}

function routeOrder(value){
  if(!Array.isArray(value)||value.length<1||value.length>ROUTE_ORDER.length||new Set(value).size!==value.length){
    throw new ValidationError('route_order is invalid');
  }
  let previous=-1;
  for(const item of value){
    const index=ROUTE_ORDER.indexOf(item);
    if(index<0||index<=previous) throw new ValidationError('route_order must preserve structured-first canonical order');
    previous=index;
  }
}
function subset(required,available,prefix,reasons){const set=new Set(available);for(const item of required)if(!set.has(item))reasons.push(prefix+':'+item);}
function exactObject(value,label,fields){if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError(label+' must be an object');const a=Object.keys(value).sort().join(',');const e=[...fields].sort().join(',');if(a!==e)throw new ValidationError(label+' fields are invalid');}
function id(value,label){if(typeof value!=='string'||!ID.test(value))throw new ValidationError(label+' is invalid');}
function digest(value,label){if(typeof value!=='string'||!DIGEST.test(value))throw new ValidationError(label+' must be a lowercase sha256 digest');}
function idArray(value,label,max){if(!Array.isArray(value)||value.length>max)throw new ValidationError(label+' is invalid');const seen=new Set();for(const item of value){id(item,label+' item');if(seen.has(item))throw new ValidationError(label+' contains duplicate values');seen.add(item);}}
function textArray(value,label,min,max,itemMax){if(!Array.isArray(value)||value.length<min||value.length>max)throw new ValidationError(label+' is invalid');const seen=new Set();for(const item of value){if(typeof item!=='string'||item.length<1||item.length>itemMax)throw new ValidationError(label+' item is invalid');if(seen.has(item))throw new ValidationError(label+' contains duplicate values');seen.add(item);}}
function canonicalDate(value,label){if(typeof value!=='string'||value.length>64)throw new ValidationError(label+' must be a canonical ISO timestamp');const d=new Date(value);if(!Number.isFinite(d.getTime())||d.toISOString()!==value)throw new ValidationError(label+' must be a canonical ISO timestamp');return d.getTime();}
