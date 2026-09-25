import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateExecutionRoutes,validateExecutionRoutePolicy} from '../src/lib/execution-route-policy.mjs';

const DIGEST='a'.repeat(64);
const NOW='2026-09-24T12:00:00.000Z';

function policy(overrides={}){
  return {
    schema:'axiom-execution-route-policy.v0',version:0,status:'inert-contract-laboratory',
    routing_id:'route.demo.1',outcome_id:'outcome.demo.1',task_id:'task.demo.1',
    operation_digest:DIGEST,authority_snapshot_ref:'authority.snapshot.1',
    effect_class:'write-external',consequence_class:'C2',required_capabilities:['artifact.write'],
    route_order:['structured-api','mcp-tool','cli','semantic-ui','visual-computer-use'],
    allow_visual_fallback:true,postcondition_required:true,reconciliation_required:true,
    grants_authority:false,execution_effect:'none',runtime_activation:false,...overrides
  };
}
function candidate(route_id,kind,overrides={}){
  return {
    route_id,kind,operation_digest:DIGEST,capabilities:['artifact.write'],availability:'available',
    currentness:'current',observed_at:'2026-09-24T11:59:00.000Z',expires_at:'2026-09-24T12:05:00.000Z',
    determinism:kind==='visual-computer-use'?'low':'high',supports_postcondition:true,
    supports_reconciliation:true,evidence_refs:['evidence:route.1'],...overrides
  };
}

test('structured route beats GUI even when GUI is available',()=>{
  const result=evaluateExecutionRoutes(policy(),[
    candidate('route.visual','visual-computer-use'),
    candidate('route.api','structured-api')
  ],{evaluatedAt:NOW});
  assert.equal(result.preferred_route_candidate_id,'route.api');
  assert.equal(result.routing_effect,'none');
  assert.equal(result.grants_authority,false);
});

test('GUI can be a last-resort candidate only with the same operation and verification support',()=>{
  const result=evaluateExecutionRoutes(policy(),[
    candidate('route.api','structured-api',{availability:'unavailable'}),
    candidate('route.visual','visual-computer-use')
  ],{evaluatedAt:NOW});
  assert.equal(result.preferred_route_candidate_id,'route.visual');

  const substituted=evaluateExecutionRoutes(policy(),[
    candidate('route.visual','visual-computer-use',{operation_digest:'b'.repeat(64)})
  ],{evaluatedAt:NOW});
  assert.equal(substituted.preferred_route_candidate_id,null);
  assert.ok(substituted.rejected[0].reasons.includes('operation-digest-mismatch'));

  const unverifiable=evaluateExecutionRoutes(policy(),[
    candidate('route.visual','visual-computer-use',{supports_postcondition:false})
  ],{evaluatedAt:NOW});
  assert.equal(unverifiable.preferred_route_candidate_id,null);
  assert.ok(unverifiable.rejected[0].reasons.includes('visual-fallback-insufficient-verification'));
});

test('route order cannot put GUI ahead of structured routes',()=>{
  const value=policy({route_order:['visual-computer-use','structured-api']});
  assert.throws(()=>validateExecutionRoutePolicy(value),/structured-first canonical order/);
});

test('visual fallback can be disabled without changing the operation',()=>{
  const value=policy({route_order:['structured-api','mcp-tool','cli','semantic-ui'],allow_visual_fallback:false});
  const result=evaluateExecutionRoutes(value,[candidate('route.visual','visual-computer-use')],{evaluatedAt:NOW});
  assert.equal(result.preferred_route_candidate_id,null);
  assert.ok(result.rejected[0].reasons.includes('route-kind-not-allowed'));
});

test('C2/C3 consequential routing cannot drop postcondition or reconciliation',()=>{
  assert.throws(()=>validateExecutionRoutePolicy(policy({postcondition_required:false})),/requires postcondition and reconciliation/);
  assert.throws(()=>validateExecutionRoutePolicy(policy({reconciliation_required:false})),/requires postcondition and reconciliation/);
});

test('available route outranks a degraded peer of the same kind',()=>{
  const result=evaluateExecutionRoutes(policy(),[
    candidate('route.a-degraded','structured-api',{availability:'degraded'}),
    candidate('route.z-available','structured-api',{availability:'available'})
  ],{evaluatedAt:NOW});
  assert.equal(result.preferred_route_candidate_id,'route.z-available');
});
