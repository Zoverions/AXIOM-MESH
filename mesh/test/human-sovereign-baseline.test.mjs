import assert from 'node:assert/strict';
import test from 'node:test';
import { validateHumanSovereignBaseline, humanSovereignBaselineDigest } from '../src/lib/human-sovereign-baseline.mjs';

const valid = () => ({
  schema:'axiom-human-sovereign-baseline.v0',version:0,status:'inert-contract-laboratory',baseline_id:'baseline.1',human_principal_id:'human.1',node_ref:'node.personal.1',
  direct_identity_access:true,direct_inspection:true,direct_consent:true,direct_refusal:true,direct_revocation:true,direct_recovery:true,direct_export:true,direct_authority_review:true,
  counterpart_optional:true,counterpart_absence_preserves_human_principal:true,counterpart_disagreement_cannot_revoke_human_authority:true,counterpart_agreement_cannot_widen_human_authority:true,counterpart_state_not_required_for_root_identity:true,direct_operation_preserves_policy_checks:true,
  created_at:'2026-09-01T12:00:00.000Z',updated_at:'2026-09-01T12:00:00.000Z',authority_effect:'none',network_effect:'none',runtime_activation:false
});

test('requires the complete human-direct minimum', () => {
  const document = valid();
  const result = validateHumanSovereignBaseline(document);
  assert.equal(result.valid, true);
  assert.equal(result.baseline_digest, humanSovereignBaselineDigest(document));
});

test('cannot make counterpart mandatory', () => {
  const document = valid();
  document.counterpart_optional = false;
  assert.throws(() => validateHumanSovereignBaseline(document), /counterpart_optional/i);
});

test('cannot bypass ordinary policy checks', () => {
  const document = valid();
  document.direct_operation_preserves_policy_checks = false;
  assert.throws(() => validateHumanSovereignBaseline(document), /policy/i);
});
