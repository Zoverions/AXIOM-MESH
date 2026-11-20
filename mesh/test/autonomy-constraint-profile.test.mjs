import assert from 'node:assert/strict';
import test from 'node:test';
import {autonomyConstraintProfileDigest,evaluateAutonomyConstraint,validateAutonomyConstraintProfile} from '../src/lib/autonomy-constraint-profile.mjs';

function profile(overrides={}){
 return {
  schema:'axiom-autonomy-constraint-profile.v0',version:0,status:'inert-narrowing-overlay',
  profile_id:'autonomy.demo.1',principal_id:'human.owner',
  source_authority_refs:['authority.files.1','authority.research.1'],
  valid_from:'2026-09-24T00:00:00.000Z',expires_at:'2026-09-25T00:00:00.000Z',
  revocation_state:'active',allowed_purpose_refs:['purpose.research'],
  allowed_capabilities:['files.read','research.local'],allowed_data_classes:['project-public'],
  allowed_destinations:[],max_consequence_class:'C1',
  max_cost:{currency:'CAD',max_minor_units:100},allowed_trigger_modes:['manual','scheduled'],
  confirmation_floor:'user-presence',may_widen_authority:false,grants_authority:false,
  execution_effect:'none',runtime_activation:false,...overrides
 };
}
function proposal(overrides={}){
 return {
  principal_id:'human.owner',purpose_ref:'purpose.research',capability:'research.local',
  data_classes:['project-public'],destination:null,consequence_class:'C1',
  cost:{currency:'CAD',minor_units:20},trigger_mode:'scheduled',
  confirmation_level:'explicit-confirmation',...overrides
 };
}
function current(overrides={}){
 return {
  assessed_at:'2026-09-24T12:00:00.000Z',authority_current:true,
  current_authority_refs:['authority.files.1','authority.research.1'],...overrides
 };
}

test('within-envelope is only narrowing evidence, never permission',()=>{
 const p=profile();
 assert.equal(validateAutonomyConstraintProfile(p).profile_digest,autonomyConstraintProfileDigest(p));
 const result=evaluateAutonomyConstraint(p,proposal(),current());
 assert.equal(result.within_envelope,true);
 assert.equal(result.may_widen_authority,false);
 assert.equal(result.grants_authority,false);
 assert.equal(result.evaluation_effect,'none');
});

test('scope widening is rejected dimension by dimension',()=>{
 const capability=evaluateAutonomyConstraint(profile(),proposal({capability:'shell.exec'}),current());
 assert.ok(capability.reasons.includes('capability-not-allowed'));
 const data=evaluateAutonomyConstraint(profile(),proposal({data_classes:['project-public','health-private']}),current());
 assert.ok(data.reasons.includes('data-class-not-allowed:health-private'));
 const destination=evaluateAutonomyConstraint(profile(),proposal({destination:'https://example.com'}),current());
 assert.ok(destination.reasons.includes('destination-not-allowed'));
 const consequence=evaluateAutonomyConstraint(profile(),proposal({consequence_class:'C2'}),current());
 assert.ok(consequence.reasons.includes('consequence-exceeds-ceiling'));
});

test('cost, trigger and confirmation bounds cannot be silently relaxed',()=>{
 const cost=evaluateAutonomyConstraint(profile(),proposal({cost:{currency:'CAD',minor_units:101}}),current());
 assert.ok(cost.reasons.includes('cost-exceeds-ceiling'));
 const trigger=evaluateAutonomyConstraint(profile(),proposal({trigger_mode:'condition-triggered'}),current());
 assert.ok(trigger.reasons.includes('trigger-mode-not-allowed'));
 const confirmation=evaluateAutonomyConstraint(profile(),proposal({confirmation_level:'none'}),current());
 assert.ok(confirmation.reasons.includes('confirmation-below-floor'));
});

test('revocation or missing source authority disables the profile',()=>{
 const revoked=evaluateAutonomyConstraint(profile({revocation_state:'revoked'}),proposal(),current());
 assert.ok(revoked.reasons.includes('profile-not-active'));
 const stale=evaluateAutonomyConstraint(profile(),proposal(),current({authority_current:false}));
 assert.ok(stale.reasons.includes('source-authority-not-current'));
 const missing=evaluateAutonomyConstraint(profile(),proposal(),current({current_authority_refs:['authority.files.1']}));
 assert.ok(missing.reasons.includes('source-authority-missing:authority.research.1'));
});

test('principal and validity window are exact, not ambient',()=>{
 const principal=evaluateAutonomyConstraint(profile(),proposal({principal_id:'human.other'}),current());
 assert.ok(principal.reasons.includes('principal-mismatch'));
 const expired=evaluateAutonomyConstraint(profile(),proposal(),current({assessed_at:'2026-09-25T00:00:00.000Z'}));
 assert.ok(expired.reasons.includes('profile-not-current'));
});
