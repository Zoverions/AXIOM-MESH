import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import { deriveAgreementId, deriveAcceptanceId, consentGrantStatementDigest } from '../src/lib/agreement-record.mjs';
import { validateCircleCorePackage } from '../src/lib/circle-core.mjs';
import * as commitments from '../src/lib/circle-commitment-admission.mjs';
import { assessCircleCommitmentStatus } from '../src/lib/circle-commitment-status.mjs';

const RECORDED = '2026-09-24T12:00:00.000Z';
const NOW = '2026-09-25T12:00:00.000Z';
const CREATED = '2026-09-20T12:00:00.000Z';
const EXPIRES = '2026-10-20T12:00:00.000Z';

function fixture() {
  const circle = {
    schema: 'axiom-circle.v0', circle_id: 'circle.team.1', name: 'Synthetic team',
    purpose: 'Test historical and current evidence separately.', created_by: 'human.owner',
    created_at: CREATED, trust_anchor_id: 'anchor.team.1', participation_model: 'voluntary',
    member_state_ownership: 'independent-node', policy_floor: 'raise-only',
    authority_effect: 'none', network_effect: 'none', runtime_activation: false
  };
  const charter = {
    schema: 'axiom-circle-charter.v0', circle_id: circle.circle_id, version: 1,
    effective_from: CREATED, supersedes_digest: null,
    roles: [{role_id: 'member', label: 'Member', declared_modes: ['propose', 'observe'], execution_authority: false}],
    decision_rule: {quorum_basis_points: 5000, approval_basis_points: 6000, abstention_counts_toward_quorum: true},
    appeal_enabled: true, member_exit_enabled: true, execution_authority: false, authority_effect: 'none'
  };
  const parties = ['human.alice', 'human.bob'];
  const invitations = parties.map((principal, i) => ({
    schema: 'axiom-circle-invitation.v0', invitation_id: `invite.${i}`, circle_id: circle.circle_id,
    invited_principal: principal, membership_class: 'member', role_ids: ['member'],
    issued_by: 'human.owner', issued_at: CREATED, expires_at: EXPIRES,
    charter_digest: digestObject(charter), one_use: true, authority_effect: 'none'
  }));
  const memberships = parties.map((principal, i) => ({
    schema: 'axiom-circle-membership.v0', membership_id: `membership.${i}`, circle_id: circle.circle_id,
    invitation_id: invitations[i].invitation_id, principal_id: principal, role_ids: ['member'],
    accepted_at: CREATED, status: 'active', status_effective_at: CREATED,
    member_state_ownership: 'independent-node', disclosure_profile: 'selective',
    authority_effect: 'none', network_effect: 'none'
  }));
  const historicalCirclePackage = {
    schema: 'axiom-circle-core-package.v0', version: 0, status: 'inert-contract-laboratory',
    circle, charter, invitations, memberships, proposals: [], tasks: [], decisions: [],
    appeals: [], exits: [], exports: [], authority_effect: 'none', network_effect: 'none', runtime_activation: false
  };
  const partyMembershipEvidence = memberships.map((member, i) => ({
    principal_id: member.principal_id,
    assurance: {
      schema: 'axiom-circle-membership-assurance.v0', version: 0, status: 'inert-assurance-laboratory',
      assurance_id: `assurance.${i}`, circle_id: circle.circle_id, membership_id: member.membership_id,
      principal_id: member.principal_id, membership_digest: digestObject(member), charter_digest: digestObject(charter),
      role_ids: ['member'], device_policy: {mode: 'required', device_refs: [`device.${i}`]},
      required_consent_receipt_refs: [`consent.circle.${i}`], evidence_refs: [`evidence.member.${i}`],
      valid_from: CREATED, expires_at: EXPIRES, contains_secret_material: false,
      authority_effect: 'none', governance_effect: 'none', execution_effect: 'none', network_effect: 'none', runtime_activation: false
    },
    current: {
      assessed_at: RECORDED, principal_id: member.principal_id, presented_device_ref: `device.${i}`,
      verified_current_device_refs: [`device.${i}`], verified_current_consent_receipt_refs: [`consent.circle.${i}`]
    },
    context_evidence_ref: `snapshot.member.${i}`, context_evidence_digest: 'd'.repeat(64)
  }));
  const agreement = {
    schema: 'axiom-agreement-record.v0', version: 0, status: 'inert-commitment-evidence', agreement_id: '', parties,
    body_digest: 'a'.repeat(64), recorded_at: RECORDED, context_tags: ['test'], supersedes: [],
    acceptance_policy: {mechanism: 'grid-consent-record', controller: 'service.recorder', purpose: 'agreement.acceptance.v0', required_scope: `agreement-body:${'a'.repeat(64)}:accept`},
    contains_private_body: false, authority_effect: 'none', enforcement_effect: 'none', legal_validity_claimed: false,
    payment_effect: 'none', settlement_effect: 'none', network_effect: 'none', runtime_activation: false
  };
  agreement.agreement_id = deriveAgreementId(agreement);
  const consentGrantStatements = parties.map((principal, i) => ({
    consent_id: `consent.agreement.${i}`, subject: principal, controller: 'service.recorder', purpose: 'agreement.acceptance.v0',
    scopes: [agreement.acceptance_policy.required_scope], expires_at: EXPIRES, created_at: CREATED,
    evidence_ref: `event.grant.${i}`, evidence_digest: 'b'.repeat(64)
  }));
  const acceptances = consentGrantStatements.map((grant, i) => {
    const acceptance = {
      schema: 'axiom-agreement-acceptance-evidence.v0', version: 0, status: 'inert-acceptance-evidence', acceptance_id: '',
      agreement_id: agreement.agreement_id, body_digest: agreement.body_digest, principal_id: grant.subject,
      consent_id: grant.consent_id, consent_grant_statement_digest: consentGrantStatementDigest(grant),
      consent_grant_evidence_ref: grant.evidence_ref, consent_grant_evidence_digest: grant.evidence_digest,
      observed_at: RECORDED, evidence_refs: [`evidence.acceptance.${i}`], authority_effect: 'none',
      enforcement_effect: 'none', consent_effect: 'none', network_effect: 'none', runtime_activation: false
    };
    acceptance.acceptance_id = deriveAcceptanceId(acceptance);
    return acceptance;
  });
  const currentConsentObservations = consentGrantStatements.map(grant => ({
    observed_at: RECORDED, evidence_ref: `snapshot.${grant.consent_id}`, evidence_digest: 'e'.repeat(64),
    record: {
      consent_id: grant.consent_id, subject: grant.subject, controller: grant.controller, purpose: grant.purpose,
      scopes_json: grant.scopes, expires_at: grant.expires_at, status: 'active', created_at: grant.created_at, revoked_at: null
    }
  }));
  const agreementEvidenceInput = {agreement, acceptances, consentGrantStatements, currentConsentObservations, assessedAt: RECORDED};
  const checked = validateCircleCorePackage(historicalCirclePackage);
  const historicalCircleSnapshotEvidence = {
    evidence_ref: 'snapshot.circle.history', evidence_digest: 'f'.repeat(64), observed_at: RECORDED,
    circle_id: circle.circle_id, package_digest: checked.package_digest, charter_digest: checked.charter_digest
  };
  const admission = {
    schema: 'axiom-circle-commitment-admission.v0', version: 0, status: 'inert-circle-commitment-admission', admission_id: '',
    circle_id: circle.circle_id, charter_digest_at_recording: checked.charter_digest,
    agreement_id: agreement.agreement_id, agreement_digest: digestObject(agreement), historical_circle_package_digest: checked.package_digest,
    historical_circle_snapshot_evidence_ref: historicalCircleSnapshotEvidence.evidence_ref,
    historical_circle_snapshot_evidence_digest: historicalCircleSnapshotEvidence.evidence_digest, recorded_at: RECORDED,
    party_bindings: partyMembershipEvidence.map(item => ({
      principal_id: item.principal_id, membership_assurance_digest: digestObject(item.assurance),
      membership_context_digest: commitments.circleMembershipContextDigest(item.current),
      membership_context_evidence_ref: item.context_evidence_ref, membership_context_evidence_digest: item.context_evidence_digest
    })), authority_effect: 'none', governance_effect: 'none', enforcement_effect: 'none', execution_effect: 'none',
    payment_effect: 'none', settlement_effect: 'none', network_effect: 'none', runtime_activation: false
  };
  admission.admission_id = commitments.deriveCircleCommitmentAdmissionId(admission);
  const historicalInput = {admission, agreementEvidenceInput, historicalCirclePackage, historicalCircleSnapshotEvidence, partyMembershipEvidence};
  const currentCircleEvidence = {
    packageDocument: structuredClone(historicalCirclePackage),
    snapshotEvidence: {...historicalCircleSnapshotEvidence, observed_at: NOW, evidence_ref: 'snapshot.circle.now'},
    partyMembershipEvidence: structuredClone(partyMembershipEvidence)
  };
  for (const member of currentCircleEvidence.partyMembershipEvidence) member.current.assessed_at = NOW;
  const currentAgreementEvidenceInput = structuredClone(agreementEvidenceInput);
  currentAgreementEvidenceInput.assessedAt = NOW;
  for (const observation of currentAgreementEvidenceInput.currentConsentObservations) observation.observed_at = NOW;
  return {historicalInput, currentCircleEvidence, currentAgreementEvidenceInput, assessedAt: NOW};
}

function project(input) {
  assert.equal(typeof assessCircleCommitmentStatus, 'function', 'currentness projection must exist');
  return assessCircleCommitmentStatus(input);
}
function refreshCircle(input) {
  const evidence = input.currentCircleEvidence;
  const checked = validateCircleCorePackage(evidence.packageDocument);
  evidence.snapshotEvidence.package_digest = checked.package_digest;
  evidence.snapshotEvidence.charter_digest = checked.charter_digest;
  for (const member of evidence.partyMembershipEvidence) {
    const record = evidence.packageDocument.memberships.find(item => item.membership_id === member.assurance.membership_id);
    if (record) member.assurance.membership_digest = digestObject(record);
  }
}
function addExit(input, effectiveAt) {
  const member = input.currentCircleEvidence.packageDocument.memberships[0];
  input.currentCircleEvidence.packageDocument.exits.push({
    schema: 'axiom-circle-exit.v0', exit_id: 'exit.alice', circle_id: member.circle_id,
    membership_id: member.membership_id, principal_id: member.principal_id, initiated_by: member.principal_id,
    kind: 'voluntary-exit', effective_at: effectiveAt, reason_code: 'member-choice',
    future_obligation_effect: 'ends-except-explicit-post-exit-rules', history_rewrite: false, authority_effect: 'none'
  });
  refreshCircle(input);
}

// Baseline proves the synthetic inputs exercise the real, unmodified assessors.
test('synthetic historical fixture is admissible under existing code', () => {
  assert.equal(commitments.assessCircleCommitmentAdmission(fixture().historicalInput).historical_circle_commitment_admissible, true);
});

test('projects historical and present support independently', () => {
  const result = project(fixture());
  assert.equal(result.historical.historical_circle_commitment_admissible, true);
  assert.equal(result.current.support_status, 'supported');
  assert.equal(result.historical_review_required, false);
  assert.equal(result.current.parties.length, 2);
});

test('later membership revocation cannot rewrite historical evidence', () => {
  const f = fixture();
  f.currentCircleEvidence.packageDocument.memberships[0].status = 'revoked';
  f.currentCircleEvidence.packageDocument.memberships[0].status_effective_at = NOW;
  refreshCircle(f);
  const before = digestObject(f.historicalInput);
  const result = project(f);
  assert.equal(result.historical.historical_circle_commitment_admissible, true);
  assert.equal(result.current.parties[0].membership.status, 'not-supported');
  assert.ok(result.current.parties[0].membership.reasons.includes('membership-not-active:revoked'));
  assert.equal(result.historical_review_required, false);
  assert.equal(digestObject(f.historicalInput), before);
});

test('effective exit overrides a stale active membership label', () => {
  const f = fixture(); addExit(f, NOW);
  const result = project(f);
  assert.equal(result.historical.historical_circle_commitment_admissible, true);
  assert.equal(result.current.support_status, 'not-supported');
  assert.ok(result.current.parties[0].membership.reasons.includes('effective-exit:voluntary-exit'));
});

test('later consent revocation changes only current support', () => {
  const f = fixture();
  Object.assign(f.currentAgreementEvidenceInput.currentConsentObservations[0].record, {status: 'revoked', revoked_at: NOW});
  const result = project(f);
  assert.equal(result.historical.historical_circle_commitment_admissible, true);
  assert.equal(result.current.parties[0].consent.status, 'not-supported');
  assert.equal(result.historical_review_required, false);
});

test('missing current snapshots and consent evidence remain unknown', () => {
  const f = fixture(); f.currentCircleEvidence = null; f.currentAgreementEvidenceInput = null;
  const result = project(f);
  assert.equal(result.current.support_status, 'unknown');
  assert.ok(result.current.parties.every(item => item.membership.status === 'unknown' && item.consent.status === 'unknown'));
  assert.equal(result.historical.historical_circle_commitment_admissible, true);
});

test('missing one party observation cannot borrow another party currentness', () => {
  const f = fixture(); f.currentCircleEvidence.partyMembershipEvidence.pop();
  f.currentAgreementEvidenceInput.currentConsentObservations.pop();
  const result = project(f);
  assert.equal(result.current.parties[0].membership.status, 'supported');
  assert.equal(result.current.parties[1].membership.status, 'unknown');
  assert.equal(result.current.parties[1].consent.status, 'unknown');
  assert.equal(result.current.support_status, 'unknown');
});

test('denial dominates unknown evidence without fabricating success', () => {
  const f = fixture(); addExit(f, NOW); f.currentAgreementEvidenceInput = null;
  assert.equal(project(f).current.support_status, 'not-supported');
});

test('current Circle snapshot is bound to exact identity digest and time', () => {
  for (const [field, value] of [['circle_id', 'circle.other'], ['package_digest', '0'.repeat(64)], ['charter_digest', '1'.repeat(64)], ['observed_at', RECORDED]]) {
    const f = fixture(); f.currentCircleEvidence.snapshotEvidence[field] = value;
    assert.throws(() => project(f), /Current Circle snapshot/);
  }
});

test('present membership evidence cannot use a past or future assessment instant', () => {
  for (const time of [RECORDED, '2026-09-26T12:00:00.000Z']) {
    const f = fixture(); f.currentCircleEvidence.partyMembershipEvidence[0].current.assessed_at = time;
    assert.throws(() => project(f), /Current membership time/);
  }
});

test('rejects duplicate outsider and substituted party evidence', () => {
  for (const mutate of [
    f => f.currentCircleEvidence.partyMembershipEvidence.push(structuredClone(f.currentCircleEvidence.partyMembershipEvidence[0])),
    f => { f.currentCircleEvidence.partyMembershipEvidence[0].principal_id = 'human.outsider'; },
    f => { f.currentCircleEvidence.partyMembershipEvidence[0].current.principal_id = 'human.bob'; }
  ]) {
    const f = fixture(); mutate(f);
    assert.throws(() => project(f), /Current membership/);
  }
});

test('present consent cannot substitute the agreement or immutable acceptance', () => {
  for (const field of ['agreement', 'acceptances', 'consentGrantStatements']) {
    const f = fixture();
    if (field === 'agreement') f.currentAgreementEvidenceInput.agreement.context_tags = ['different'];
    else f.currentAgreementEvidenceInput[field][0].evidence_refs = ['new-claim'];
    assert.throws(() => project(f), /Current agreement immutable/);
  }
});

test('current agreement assessment time must match the requested instant', () => {
  const f = fixture(); f.currentAgreementEvidenceInput.assessedAt = RECORDED;
  assert.throws(() => project(f), /Current agreement assessment time/);
});

test('stale consent observation is unknown rather than current support', () => {
  const f = fixture(); f.currentAgreementEvidenceInput.currentConsentObservations[0].observed_at = RECORDED;
  assert.equal(project(f).current.parties[0].consent.status, 'unknown');
});

test('expired assurance and removed device are not supported', () => {
  for (const mutate of [
    f => { f.currentCircleEvidence.partyMembershipEvidence[0].assurance.expires_at = NOW; },
    f => { f.currentCircleEvidence.partyMembershipEvidence[0].current.verified_current_device_refs = []; }
  ]) {
    const f = fixture(); mutate(f);
    assert.equal(project(f).current.parties[0].membership.status, 'not-supported');
  }
});

test('new evidence of pre-recording revocation flags historical review', () => {
  const f = fixture();
  Object.assign(f.currentAgreementEvidenceInput.currentConsentObservations[0].record, {status: 'revoked', revoked_at: '2026-09-24T11:59:00.000Z'});
  const result = project(f);
  assert.equal(result.historical.historical_circle_commitment_admissible, true);
  assert.equal(result.historical_review_required, true);
  assert.ok(result.historical_review_reasons.some(reason => reason.includes('consent-revoked-before-agreement-recorded')));
});

test('new evidence of a pre-recording exit flags review without rewriting the old snapshot', () => {
  const f = fixture(); addExit(f, '2026-09-24T11:59:00.000Z');
  const result = project(f);
  assert.equal(result.historical.historical_circle_commitment_admissible, true);
  assert.equal(result.historical_review_required, true);
});

test('future charter cannot be projected as current', () => {
  const f = fixture();
  const charter = f.currentCircleEvidence.packageDocument.charter;
  charter.effective_from = '2026-09-26T12:00:00.000Z';
  for (const invitation of f.currentCircleEvidence.packageDocument.invitations) invitation.charter_digest = digestObject(charter);
  refreshCircle(f);
  assert.throws(() => project(f), /Current Circle chronology/);
});

test('immutable inputs and result preserve deterministic non-authorizing projection', () => {
  const f = fixture();
  function freeze(value) { if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); } return value; }
  const before = digestObject(f); freeze(f);
  const first = project(f); const second = project(f);
  assert.deepEqual(first, second);
  assert.equal(digestObject(f), before);
  assert.ok(Object.isFrozen(first.current.parties[0].membership.reasons));
  assert.equal(first.requires_external_evidence_verification, true);
  for (const field of ['authority_effect', 'governance_effect', 'enforcement_effect', 'execution_effect', 'payment_effect', 'settlement_effect', 'network_effect']) assert.equal(first[field], 'none');
  assert.equal(first.runtime_activation, false);
});

test('assessment cannot predate the retained historical evaluation', () => {
  const f = fixture(); f.assessedAt = '2026-09-23T12:00:00.000Z';
  assert.throws(() => project(f), /Status assessment predates/);
});

test('renewed current charter is visible without substituting historical charter', () => {
  const f = fixture(); const historyDigest = digestObject(f.historicalInput);
  const pack = f.currentCircleEvidence.packageDocument;
  pack.charter.version = 2;
  pack.charter.supersedes_digest = digestObject(f.historicalInput.historicalCirclePackage.charter);
  pack.charter.effective_from = NOW;
  for (const invitation of pack.invitations) invitation.charter_digest = digestObject(pack.charter);
  for (const member of f.currentCircleEvidence.partyMembershipEvidence) member.assurance.charter_digest = digestObject(pack.charter);
  refreshCircle(f);
  const result = project(f);
  assert.equal(result.current.charter_changed, true);
  assert.equal(result.current.support_status, 'supported');
  assert.equal(result.historical_review_required, false);
  assert.equal(digestObject(f.historicalInput), historyDigest);
});

test('positive current evidence cannot repair an invalid historical binding', () => {
  const f = fixture();
  f.historicalInput.admission.historical_circle_package_digest = '0'.repeat(64);
  f.historicalInput.admission.admission_id = commitments.deriveCircleCommitmentAdmissionId(f.historicalInput.admission);
  const result = project(f);
  assert.equal(result.historical.historical_circle_commitment_admissible, false);
  assert.equal(result.current.support_status, 'supported');
  assert.equal(result.authority_effect, 'none');
});

test('accessor-bearing inputs are rejected without invoking accessors', () => {
  const f = fixture(); let calls = 0;
  Object.defineProperty(f, 'currentCircleEvidence', {enumerable: true, get() { calls += 1; return null; }});
  assert.throws(() => project(f), /enumerable data property/);
  assert.equal(calls, 0);
});

test('unknown input fields cannot request execution', () => {
  assert.throws(() => project({...fixture(), execute: true}), /fields are invalid/);
});

test('projection digest binds assessment time and supplied evidence', () => {
  const f = fixture(); const first = project(f);
  const {status_digest, ...body} = first;
  assert.equal(status_digest, digestObject(body));
  f.currentCircleEvidence.snapshotEvidence.evidence_digest = '1'.repeat(64);
  const second = project(f);
  assert.notEqual(first.input_digest, second.input_digest);
  assert.notEqual(first.status_digest, second.status_digest);
});

test('current evidence order cannot change per-party decisions', () => {
  const f = fixture(); const first = project(f);
  f.currentCircleEvidence.partyMembershipEvidence.reverse();
  f.currentAgreementEvidenceInput.acceptances.reverse();
  f.currentAgreementEvidenceInput.consentGrantStatements.reverse();
  f.currentAgreementEvidenceInput.currentConsentObservations.reverse();
  const second = project(f);
  assert.deepEqual(first.current, second.current);
  // Input digests intentionally bind exact supplied packets, including order.
  assert.notEqual(first.input_digest, second.input_digest);
});

// Mixed-evidence regression cases: definite negatives must not become unknown.
test('stale revoked consent remains not-supported and retains both reasons', () => {
  const f = fixture();
  const observation = f.currentAgreementEvidenceInput.currentConsentObservations[0];
  observation.observed_at = '2026-09-24T18:00:00.000Z';
  Object.assign(observation.record, {status: 'revoked', revoked_at: observation.observed_at});
  const historyBefore = digestObject(f.historicalInput);
  const result = project(f);
  const consent = result.current.parties[0].consent;
  assert.equal(consent.status, 'not-supported');
  assert.ok(consent.reasons.includes('current-consent-observation-time-mismatch'));
  assert.ok(consent.reasons.includes('current-consent-revoked'));
  assert.equal(result.current.support_status, 'not-supported');
  assert.equal(result.historical.historical_circle_commitment_admissible, true);
  assert.equal(result.historical_review_required, false);
  assert.equal(digestObject(f.historicalInput), historyBefore);
});

test('stale expired consent remains not-supported rather than unknown', () => {
  const f = fixture();
  f.assessedAt = EXPIRES;
  f.currentCircleEvidence = null;
  f.currentAgreementEvidenceInput.assessedAt = EXPIRES;
  const result = project(f);
  assert.equal(result.current.parties[0].consent.status, 'not-supported');
  assert.ok(result.current.parties[0].consent.reasons.includes('current-consent-expired'));
  assert.ok(result.current.parties[0].consent.reasons.includes('current-consent-observation-time-mismatch'));
  assert.equal(result.current.support_status, 'not-supported');
});

test('missing observation cannot conceal expiry in the exact immutable grant', () => {
  const f = fixture();
  f.assessedAt = EXPIRES;
  f.currentCircleEvidence = null;
  f.currentAgreementEvidenceInput.assessedAt = EXPIRES;
  f.currentAgreementEvidenceInput.currentConsentObservations = [];
  const result = project(f);
  assert.ok(result.current.parties.every(row => row.consent.status === 'not-supported'));
  assert.ok(result.current.parties[0].consent.reasons.includes('current-consent-expired'));
  assert.ok(result.current.parties[0].consent.reasons.includes('current-consent-missing'));
  assert.equal(result.current.support_status, 'not-supported');
});

test('stale consent with a mismatched binding is not downgraded to unknown', () => {
  const f = fixture();
  const observation = f.currentAgreementEvidenceInput.currentConsentObservations[0];
  observation.observed_at = RECORDED;
  observation.record.controller = 'service.other';
  const consent = project(f).current.parties[0].consent;
  assert.equal(consent.status, 'not-supported');
  assert.ok(consent.reasons.includes('current-consent-binding-mismatch'));
  assert.ok(consent.reasons.includes('current-consent-observation-time-mismatch'));
});

test('stale pre-recording revocation retains negative status and historical review', () => {
  const f = fixture();
  const observation = f.currentAgreementEvidenceInput.currentConsentObservations[0];
  observation.observed_at = RECORDED;
  Object.assign(observation.record, {status: 'revoked', revoked_at: '2026-09-24T11:59:00.000Z'});
  const result = project(f);
  assert.equal(result.current.parties[0].consent.status, 'not-supported');
  assert.equal(result.historical_review_required, true);
  assert.equal(result.historical.historical_circle_commitment_admissible, true);
});

for (const status of ['revoked', 'suspended', 'exited']) {
  test(`current ${status} membership remains negative without supplemental context`, () => {
    const f = fixture();
    Object.assign(f.currentCircleEvidence.packageDocument.memberships[0], {status, status_effective_at: NOW});
    f.currentCircleEvidence.partyMembershipEvidence.shift();
    refreshCircle(f);
    const result = project(f);
    assert.equal(result.current.parties[0].membership.status, 'not-supported');
    assert.ok(result.current.parties[0].membership.reasons.includes(`membership-not-active:${status}`));
    assert.ok(result.current.parties[0].membership.reasons.includes('current-membership-evidence-missing'));
    assert.equal(result.current.parties[1].membership.status, 'supported');
  });
}

test('effective exit remains negative when supplemental member context is missing', () => {
  const f = fixture(); addExit(f, NOW);
  f.currentCircleEvidence.partyMembershipEvidence.shift();
  const result = project(f);
  assert.equal(result.current.parties[0].membership.status, 'not-supported');
  assert.ok(result.current.parties[0].membership.reasons.includes('effective-exit:voluntary-exit'));
  assert.equal(result.historical_review_required, false);
});

test('pre-recording exit remains negative without context and still requires review', () => {
  const f = fixture(); addExit(f, '2026-09-24T11:59:00.000Z');
  f.currentCircleEvidence.partyMembershipEvidence.shift();
  const result = project(f);
  assert.equal(result.current.parties[0].membership.status, 'not-supported');
  assert.equal(result.historical_review_required, true);
});

test('future negative membership state cannot be inferred as presently effective', () => {
  const f = fixture();
  Object.assign(f.currentCircleEvidence.packageDocument.memberships[0], {
    status: 'revoked', status_effective_at: '2026-09-26T12:00:00.000Z'
  });
  f.currentCircleEvidence.partyMembershipEvidence.shift();
  refreshCircle(f);
  const result = project(f);
  assert.equal(result.current.parties[0].membership.status, 'unknown');
  assert.equal(result.historical_review_required, false);
});

test('future exit without member context remains unknown rather than effective', () => {
  const f = fixture(); addExit(f, '2026-09-26T12:00:00.000Z');
  f.currentCircleEvidence.partyMembershipEvidence.shift();
  assert.equal(project(f).current.parties[0].membership.status, 'unknown');
});

test('old membership exit cannot negate separately assessed active re-entry', () => {
  const f = fixture(); addExit(f, NOW);
  const pack = f.currentCircleEvidence.packageDocument;
  const invitation = {...pack.invitations[0], invitation_id: 'invite.reentry', issued_at: NOW};
  pack.invitations.push(invitation);
  const member = {...pack.memberships[0], membership_id: 'membership.reentry',
    invitation_id: invitation.invitation_id, accepted_at: NOW, status_effective_at: NOW};
  pack.memberships.push(member);
  const evidence = f.currentCircleEvidence.partyMembershipEvidence[0];
  Object.assign(evidence.assurance, {membership_id: member.membership_id,
    membership_digest: digestObject(member), valid_from: NOW});
  refreshCircle(f);
  const result = project(f);
  assert.equal(result.current.parties[0].membership.status, 'supported');
  assert.equal(result.historical_review_required, false);
});
