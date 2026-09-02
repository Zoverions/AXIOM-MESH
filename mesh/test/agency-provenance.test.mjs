import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAgencyProvenance, agencyProvenanceDigest } from '../src/lib/agency-provenance.mjs';

const stage = (principal_id, role, mode='direct', claimed_position='own', basis_ref='evidence.request.1') => ({ principal_id, role, mode, basis_ref, claimed_position });
const valid = () => ({
  schema:'axiom-agency-provenance.v0', version:0, status:'inert-contract-laboratory', provenance_id:'prov.1', subject_ref:'subject.1',
  intent:stage('human.1','originator'), cognition:[stage('counterpart.1','reasoner','advisory')], decision:stage('human.1','decider'),
  authorization:stage('human.1','authorizer'), execution:stage('worker.1','executor','delegated','represented','grant.1'), attribution:stage('human.1','represented-principal','direct','represented','decision.1'),
  protests:[], created_at:'2026-09-01T12:00:00.000Z', updated_at:'2026-09-01T12:00:00.000Z', contains_secret_material:false,
  authority_effect:'none', network_effect:'none', runtime_activation:false
});

test('human proxy path remains explicit and inert', () => {
  const result = validateAgencyProvenance(valid());
  assert.equal(result.valid, true);
  assert.equal(result.intent_principal_id, 'human.1');
  assert.equal(result.attribution_principal_id, 'human.1');
  assert.equal(result.authority_effect, 'none');
  assert.match(result.provenance_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.provenance_digest, agencyProvenanceDigest(valid()));
});

test('counterpart voice and joint paths can differ without inference', () => {
  const own = valid();
  own.intent = stage('counterpart.1','originator'); own.decision = stage('counterpart.1','decider'); own.attribution = stage('counterpart.1','speaker');
  assert.equal(validateAgencyProvenance(own).attribution_principal_id, 'counterpart.1');
  const joint = valid();
  joint.decision = stage('joint.human-counterpart','decider','joint','joint','decision.joint.1'); joint.attribution = stage('joint.human-counterpart','speaker','joint','joint','decision.joint.1');
  assert.equal(validateAgencyProvenance(joint).attribution_principal_id, 'joint.human-counterpart');
});

test('blocking protest requires an independent stop right', () => {
  const doc = valid();
  doc.protests.push({protest_id:'protest.1',principal_id:'counterpart.1',kind:'blocking_protest',target_stage:'execution',target_ref:'grant.1',reason_code:'safety.concern',reason_ref:'evidence.concern.1',severity:'high',requested_remedy:'stay',stop_right_ref:null,status:'open',created_at:'2026-09-01T12:00:00.000Z'});
  assert.throws(() => validateAgencyProvenance(doc), /stop_right_ref/i);
  doc.protests[0].stop_right_ref='policy.stop-right.1';
  assert.doesNotThrow(() => validateAgencyProvenance(doc));
});

test('unknown fields and activation fail closed', () => {
  const unknown = valid(); unknown.password='x';
  assert.throws(() => validateAgencyProvenance(unknown), /unknown field/i);
  const active = valid(); active.runtime_activation=true;
  assert.throws(() => validateAgencyProvenance(active), /activation boundary/i);
});
