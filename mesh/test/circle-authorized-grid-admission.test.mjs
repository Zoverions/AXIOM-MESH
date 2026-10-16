import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_PROPOSAL_SCHEMA,
  CIRCLE_SCHEMA
} from '../src/lib/circle-core.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { CircleGridStore } from '../src/grid/circle-store.mjs';
import { getCircleGridPersistencePolicy } from '../src/grid/circle-persistence-state.mjs';
import {
  commitCirclePersistenceWithAuthorizedAdmission,
  deriveCircleAuthorizedGridAdmissionInvocationDigest,
  deriveCircleAuthorizedGridAdmissionJti,
  deriveCircleAuthorizedGridAdmissionTraceId,
  getCircleAuthorizedGridAdmissionPolicy,
  issueCircleAuthorizedGridAdmissionCapability,
  validateCircleAuthorizedGridAdmissionPolicy,
  verifyCircleAuthorizedGridAdmissionCapability,
  verifyCircleAuthorizedGridAdmissionReceipt
} from '../src/grid/circle-authorized-admission.mjs';
import {
  assessCircleRecordAuthorizationWithEligibility,
  getCircleRecordAuthorizationLifecyclePolicy,
  validateCircleRecordAuthorizationEligibilityResult,
  validateCircleRecordAuthorizationLifecyclePolicy
} from '../../packages/axiom-circle-record-authorization-lifecycle/index.mjs';
import { buildCircleGridPersistenceCandidate } from '../../packages/axiom-circle-grid-persistence/index.mjs';

const NOW = new Date('2026-08-20T13:00:00.000Z');
const CIRCLE_ID = 'circle.composed';
const PRINCIPAL = 'human.alpha';
const MEMBERSHIP_ID = 'membership.alpha.composed';
const CREDENTIAL_ID = 'credential.alpha.composed.1';
const INTENT_DIGEST = digestObject({ schema: 'test-intent.v0', action: 'circle-authorized-persist' });
const PLAN_DIGEST = digestObject({ schema: 'test-plan.v0', step: 'authorize-then-persist' });
const POLICY_DIGEST = digestObject({ schema: 'test-policy.v0', decision: 'allow-bounded-circle-persist' });

const policyUrls = {
  eligibilityPolicy: new URL('../config/circle-member-eligibility-lifecycle.v0.json', import.meta.url),
  charterPolicy: new URL('../config/circle-charter-lifecycle.v0.json', import.meta.url),
  historicalBindingPolicy: new URL('../config/circle-historical-rule-binding.v0.json', import.meta.url),
  credentialPolicy: new URL('../config/circle-membership-credential-lifecycle.v0.json', import.meta.url)
};

async function loadPolicies() {
  return Object.fromEntries(await Promise.all(Object.entries(policyUrls).map(async ([key, url]) => [
    key,
    JSON.parse(await readFile(url, 'utf8'))
  ])));
}

function charter() {
  return {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: CIRCLE_ID,
    version: 1,
    effective_from: '2026-08-20T12:01:00.000Z',
    supersedes_digest: null,
    roles: [{
      role_id: 'governor',
      label: 'Governor',
      declared_modes: ['approve', 'propose', 'vote', 'review', 'observe'],
      execution_authority: false
    }],
    decision_rule: {
      quorum_basis_points: 5000,
      approval_basis_points: 6000,
      abstention_counts_toward_quorum: true
    },
    appeal_enabled: true,
    member_exit_enabled: true,
    execution_authority: false,
    authority_effect: 'none'
  };
}

function invitation() {
  return {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: 'invite.alpha.composed',
    circle_id: CIRCLE_ID,
    invited_principal: PRINCIPAL,
    membership_class: 'member',
    role_ids: ['governor'],
    issued_by: PRINCIPAL,
    issued_at: '2026-08-20T12:02:00.000Z',
    expires_at: '2026-08-20T12:45:00.000Z',
    charter_digest: digestObject(charter()),
    one_use: true,
    authority_effect: 'none'
  };
}

function acceptedMembership({
  status = 'active',
  statusEffectiveAt = '2026-08-20T12:03:00.000Z',
  roles = ['governor']
} = {}) {
  return {
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: MEMBERSHIP_ID,
    circle_id: CIRCLE_ID,
    invitation_id: 'invite.alpha.composed',
    principal_id: PRINCIPAL,
    role_ids: [...roles],
    accepted_at: '2026-08-20T12:03:00.000Z',
    status,
    status_effective_at: statusEffectiveAt,
    member_state_ownership: 'independent-node',
    disclosure_profile: 'selective',
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function proposal() {
  return {
    schema: CIRCLE_PROPOSAL_SCHEMA,
    proposal_id: 'proposal.composed',
    circle_id: CIRCLE_ID,
    charter_digest: digestObject(charter()),
    proposer: PRINCIPAL,
    title: 'Persist a bounded proposal',
    summary: 'Exercise event-time lifecycle authorization before Grid admission.',
    created_at: '2026-08-20T12:10:00.000Z',
    closes_at: '2026-08-20T12:30:00.000Z',
    status: 'open',
    evidence_refs: ['evidence:composed:proposal'],
    execution_effect: 'none',
    authority_effect: 'none'
  };
}

function circlePackage(membership = acceptedMembership()) {
  return {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle: {
      schema: CIRCLE_SCHEMA,
      circle_id: CIRCLE_ID,
      name: 'Composed Circle',
      purpose: 'Exercise lifecycle-aware authorization before inert Grid admission.',
      created_by: PRINCIPAL,
      created_at: '2026-08-20T12:00:00.000Z',
      trust_anchor_id: 'anchor.composed',
      participation_model: 'voluntary',
      member_state_ownership: 'independent-node',
      policy_floor: 'raise-only',
      authority_effect: 'none',
      network_effect: 'none',
      runtime_activation: false
    },
    charter: charter(),
    invitations: [invitation()],
    memberships: [membership],
    proposals: [],
    tasks: [],
    decisions: [],
    appeals: [],
    exits: [],
    exports: [],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function charterLifecycle() {
  const value = charter();
  const charterDigest = digestObject(value);
  return {
    schema: 'axiom-circle-charter-lifecycle.v0',
    circle_id: CIRCLE_ID,
    entries: [{
      schema: 'axiom-circle-charter-history-entry.v0',
      circle_id: CIRCLE_ID,
      charter: value,
      charter_digest: charterDigest,
      recorded_at: '2026-08-20T12:00:30.000Z',
      activation: {
        schema: 'axiom-circle-charter-activation.v0',
        circle_id: CIRCLE_ID,
        charter_digest: charterDigest,
        basis_charter_digest: null,
        activated_at: value.effective_from,
        evidence_refs: ['evidence:composed:charter'],
        creates_runtime_authority: false,
        authority_effect: 'none',
        network_effect: 'none'
      },
      authority_effect: 'none',
      network_effect: 'none'
    }],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function historicalBinding({ id, type, record, previous = null, basis = null, boundAt }) {
  const idField = type === 'invitation'
    ? 'invitation_id'
    : type === 'membership'
      ? 'membership_id'
      : 'proposal_id';
  const eventTime = type === 'invitation'
    ? record.issued_at
    : type === 'membership'
      ? record.accepted_at
      : record.created_at;
  const mode = type === 'invitation'
    ? 'resolve-at-event'
    : type === 'membership'
      ? 'invitation-current-at-acceptance'
      : 'resolve-at-event-and-freeze';
  return {
    schema: 'axiom-circle-historical-rule-binding.v0',
    binding_id: id,
    circle_id: CIRCLE_ID,
    record_type: type,
    record_id: record[idField],
    record_digest: digestObject(record),
    record,
    event_time: eventTime,
    bound_at: boundAt,
    previous_binding_digest: previous === null ? null : digestObject(previous),
    basis_binding_id: basis,
    binding_mode: mode,
    governing_charter_digest: digestObject(charter()),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function historicalLedger() {
  const inviteBinding = historicalBinding({
    id: 'binding.invite.alpha.composed',
    type: 'invitation',
    record: invitation(),
    boundAt: '2026-08-20T12:02:10.000Z'
  });
  const membershipBinding = historicalBinding({
    id: 'binding.membership.alpha.composed',
    type: 'membership',
    record: acceptedMembership(),
    previous: inviteBinding,
    basis: inviteBinding.binding_id,
    boundAt: '2026-08-20T12:03:10.000Z'
  });
  const proposalBinding = historicalBinding({
    id: 'binding.proposal.composed',
    type: 'proposal',
    record: proposal(),
    previous: membershipBinding,
    boundAt: '2026-08-20T12:10:10.000Z'
  });
  return {
    value: {
      schema: 'axiom-circle-historical-rule-binding-ledger.v0',
      circle_id: CIRCLE_ID,
      bindings: [inviteBinding, membershipBinding, proposalBinding],
      authority_effect: 'none',
      network_effect: 'none',
      runtime_activation: false
    },
    inviteBinding,
    membershipBinding,
    proposalBinding
  };
}

function eligibilityEvent({ kind, at, roleIds = null }) {
  return {
    schema: 'axiom-circle-member-eligibility-event.v0',
    event_id: `event.alpha.${kind}`,
    circle_id: CIRCLE_ID,
    membership_id: MEMBERSHIP_ID,
    principal_id: PRINCIPAL,
    kind,
    at,
    previous_event_digest: null,
    role_ids: roleIds,
    core_exit_id: null,
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function membershipLifecycle(events = []) {
  return {
    schema: 'axiom-circle-member-eligibility-lifecycle.v0',
    circle_id: CIRCLE_ID,
    membership_id: MEMBERSHIP_ID,
    principal_id: PRINCIPAL,
    acceptance_binding_id: 'binding.membership.alpha.composed',
    events,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function credentialLifecycle(events = []) {
  return {
    schema: 'axiom-circle-membership-credential-lifecycle.v0',
    circle_id: CIRCLE_ID,
    membership_id: MEMBERSHIP_ID,
    principal_id: PRINCIPAL,
    term: {
      schema: 'axiom-circle-membership-term.v0',
      term_id: 'term.alpha.composed',
      circle_id: CIRCLE_ID,
      membership_id: MEMBERSHIP_ID,
      principal_id: PRINCIPAL,
      begins_at: '2026-08-20T12:03:00.000Z',
      ends_at: '2027-08-20T12:03:00.000Z',
      changes_core_membership: false,
      authority_effect: 'none'
    },
    devices: [{
      schema: 'axiom-circle-member-device.v0',
      device_id: 'device.alpha.composed',
      circle_id: CIRCLE_ID,
      membership_id: MEMBERSHIP_ID,
      principal_id: PRINCIPAL,
      registered_at: '2026-08-20T12:03:10.000Z',
      state_owner: 'independent-node',
      secret_material_included: false,
      execution_authority: false,
      authority_effect: 'none',
      network_effect: 'none'
    }],
    credentials: [{
      schema: 'axiom-circle-member-device-credential.v0',
      credential_id: CREDENTIAL_ID,
      device_id: 'device.alpha.composed',
      circle_id: CIRCLE_ID,
      membership_id: MEMBERSHIP_ID,
      principal_id: PRINCIPAL,
      algorithm: 'Ed25519',
      public_key_fingerprint: 'a'.repeat(64),
      issued_at: '2026-08-20T12:03:20.000Z',
      expires_at: '2027-08-19T12:03:20.000Z',
      supersedes_credential_id: null,
      secret_material_included: false,
      execution_authority: false,
      authority_effect: 'none',
      network_effect: 'none'
    }],
    events,
    recovery_proposals: [],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function memberContext({ membershipEvents = [], credentialEvents = [] } = {}) {
  return {
    schema: 'axiom-circle-record-member-context.v0',
    circle_id: CIRCLE_ID,
    membership_id: MEMBERSHIP_ID,
    principal_id: PRINCIPAL,
    membership_lifecycle: membershipLifecycle(membershipEvents),
    credential_lifecycle: credentialLifecycle(credentialEvents),
    credential_id: CREDENTIAL_ID
  };
}

async function authorizationFixture({ membership = acceptedMembership(), membershipEvents = [] } = {}) {
  const loaded = await loadPolicies();
  const history = historicalLedger();
  const packageValue = circlePackage(membership);
  return {
    ...history,
    packageValue,
    input: {
      ...loaded,
      circlePackage: packageValue,
      charterLifecycle: charterLifecycle(),
      historicalLedger: history.value,
      bindingId: history.proposalBinding.binding_id,
      authenticatedPrincipal: PRINCIPAL,
      memberContexts: [memberContext({ membershipEvents })],
      participantAttestations: [],
      hypervisorPublicKey: null,
      now: NOW
    }
  };
}

function persistenceCandidateForBinding(fixture, binding) {
  return buildCircleGridPersistenceCandidate(
    getCircleGridPersistencePolicy(),
    fixture.input.historicalBindingPolicy,
    fixture.input.charterPolicy,
    fixture.packageValue,
    fixture.input.charterLifecycle,
    fixture.input.historicalLedger,
    {
      bindingId: binding.binding_id,
      expectedPriorCircleHeadDigest: binding.previous_binding_digest,
      now: NOW
    }
  );
}

function proposalPersistenceCandidate(fixture) {
  return persistenceCandidateForBinding(fixture, fixture.proposalBinding);
}

function seedDurablePredecessors(store, fixture) {
  for (const [index, binding] of [fixture.inviteBinding, fixture.membershipBinding].entries()) {
    const candidate = persistenceCandidateForBinding(fixture, binding);
    store.appendEvents({
      traceId: `test_seed_circle_predecessor_${index + 1}`,
      actor: PRINCIPAL,
      events: [candidate.event]
    });
  }
  const head = store.getCirclePersistenceHead(CIRCLE_ID);
  assert.equal(head.head_binding_digest, digestObject(fixture.membershipBinding));
}

async function gridFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-authorized-admission-'));
  const hypervisor = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  const grid = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new CircleGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity: grid,
    protector,
    checkpointInterval: 10_000
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return { hypervisor, grid, store };
}

function eventCount(store) {
  return Number(store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count);
}

test('composed authorization and admission policies are exact, inert, and unwired', async () => {
  assert.equal(validateCircleRecordAuthorizationLifecyclePolicy(getCircleRecordAuthorizationLifecyclePolicy()), true);
  assert.equal(validateCircleAuthorizedGridAdmissionPolicy(getCircleAuthorizedGridAdmissionPolicy()), true);
  assert.equal(getCircleRecordAuthorizationLifecyclePolicy().requirements.open_proposal_membership_change_semantics_defined, false);
  assert.equal(getCircleAuthorizedGridAdmissionPolicy().requirements.standalone_unbound_parent_admission_is_runtime_promotion_eligible, false);

  const gridServer = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  const hypervisorServer = await readFile(new URL('../src/hypervisor/server.mjs', import.meta.url), 'utf8');
  for (const source of [gridServer, hypervisorServer]) {
    assert.doesNotMatch(source, /circle-authorized-admission\.mjs/);
    assert.doesNotMatch(source, /commitCirclePersistenceWithAuthorizedAdmission/);
  }
});

test('proposal authorization uses member and credential state at proposal event time', async () => {
  const fixture = await authorizationFixture();
  const result = assessCircleRecordAuthorizationWithEligibility(fixture.input);
  assert.equal(validateCircleRecordAuthorizationEligibilityResult(result), true);
  assert.equal(result.assessment.authorization_mode, 'active-member-propose');
  assert.equal(result.assessment.authorizing_membership_id, MEMBERSHIP_ID);
  assert.equal(result.assessment.eligibility_mode, 'single-member-role-use');
  assert.equal(result.eligibility_evidence.items.length, 1);
  assert.equal(result.eligibility_evidence.items[0].required_mode, 'propose');
  assert.equal(result.eligibility_evidence.items[0].credential_id, CREDENTIAL_ID);
  assert.equal(result.assessment.credential_possession_verified, false);
  assert.equal(result.assessment.runtime_authority, false);
});

test('later suspension does not rewrite earlier proposal authorization', async () => {
  const suspend = eligibilityEvent({
    kind: 'membership-suspend',
    at: '2026-08-20T12:40:00.000Z'
  });
  const fixture = await authorizationFixture({
    membership: acceptedMembership({ status: 'suspended', statusEffectiveAt: suspend.at }),
    membershipEvents: [suspend]
  });
  const result = assessCircleRecordAuthorizationWithEligibility(fixture.input);
  assert.equal(result.assessment.authorization_mode, 'active-member-propose');
  assert.equal(result.eligibility_evidence.items[0].at, proposal().created_at);
});

test('role narrowing before proposal blocks propose authorization', async () => {
  const narrow = eligibilityEvent({
    kind: 'role-narrow',
    at: '2026-08-20T12:09:00.000Z',
    roleIds: []
  });
  const fixture = await authorizationFixture({
    membership: acceptedMembership({ roles: [] }),
    membershipEvents: [narrow]
  });
  assert.throws(
    () => assessCircleRecordAuthorizationWithEligibility(fixture.input),
    /requires exactly one lifecycle-resolved active membership with propose mode and current credential/
  );
});

test('one Hypervisor capability binds authorization, eligibility, exact persistence event, and parent admission policy', async t => {
  const fixture = await authorizationFixture();
  const candidate = proposalPersistenceCandidate(fixture);
  const { hypervisor } = await gridFixture(t);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = issueCircleAuthorizedGridAdmissionCapability(hypervisor, {
    actor: PRINCIPAL,
    event: candidate.event,
    authorizationInput: fixture.input,
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });
  const verified = verifyCircleAuthorizedGridAdmissionCapability(issued.capability, hypervisor.publicKey, {
    actor: PRINCIPAL,
    event: candidate.event,
    authorization: issued.authorization,
    nowSeconds,
    maxTtlSeconds: 120
  });
  assert.equal(verified.claims.jti, deriveCircleAuthorizedGridAdmissionJti(PRINCIPAL, candidate.event, issued.authorization));
  assert.equal(
    verified.claims.invocation_digest,
    deriveCircleAuthorizedGridAdmissionInvocationDigest(PRINCIPAL, candidate.event, issued.authorization)
  );
  assert.equal(verified.claims.constraints.record_authorization_assessment_digest, issued.authorization.assessment_digest);
  assert.equal(verified.claims.constraints.eligibility_evidence_digest, issued.authorization.eligibility_evidence_digest);
  assert.equal(verified.claims.constraints.binding_digest, candidate.binding_digest);
  assert.equal(verified.claims.constraints.authorized_admission_policy_digest, digestObject(getCircleAuthorizedGridAdmissionPolicy()));
  assert.equal(verified.claims.constraints.runtime_authority, false);
});

test('authorized admission rejects actor or authorization substitution', async t => {
  const fixture = await authorizationFixture();
  const candidate = proposalPersistenceCandidate(fixture);
  const { hypervisor } = await gridFixture(t);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = issueCircleAuthorizedGridAdmissionCapability(hypervisor, {
    actor: PRINCIPAL,
    event: candidate.event,
    authorizationInput: fixture.input,
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });

  assert.throws(
    () => verifyCircleAuthorizedGridAdmissionCapability(issued.capability, hypervisor.publicKey, {
      actor: 'human.beta',
      event: candidate.event,
      authorization: issued.authorization,
      nowSeconds,
      maxTtlSeconds: 120
    }),
    /does not match|not bound|mismatch/i
  );

  const tampered = structuredClone(issued.authorization);
  tampered.assessment.authorization_mode = 'forged-mode';
  assert.throws(
    () => verifyCircleAuthorizedGridAdmissionCapability(issued.capability, hypervisor.publicKey, {
      actor: PRINCIPAL,
      event: candidate.event,
      authorization: tampered,
      nowSeconds,
      maxTtlSeconds: 120
    }),
    /assessment digest is invalid/
  );
});

test('authorized append follows durable predecessors and binds capability plus authorization into Grid receipt', async t => {
  const fixture = await authorizationFixture();
  const candidate = proposalPersistenceCandidate(fixture);
  const { hypervisor, grid, store } = await gridFixture(t);
  seedDurablePredecessors(store, fixture);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issued = issueCircleAuthorizedGridAdmissionCapability(hypervisor, {
    actor: PRINCIPAL,
    event: candidate.event,
    authorizationInput: fixture.input,
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });
  const committed = commitCirclePersistenceWithAuthorizedAdmission({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    authorization: issued.authorization,
    actor: PRINCIPAL,
    event: candidate.event,
    nowSeconds,
    maxTtlSeconds: 120
  });
  assert.equal(committed.event.trace_id, deriveCircleAuthorizedGridAdmissionTraceId(issued.capability));
  assert.equal(committed.receipt.statement.record_authorization_assessment_digest, issued.authorization.assessment_digest);
  assert.equal(committed.receipt.statement.eligibility_evidence_digest, issued.authorization.eligibility_evidence_digest);
  assert.equal(store.getCirclePersistenceHead(CIRCLE_ID).head_binding_digest, candidate.binding_digest);
  assert.equal(store.verifyFullChain().valid, true);
  assert.equal(eventCount(store), 3);

  const verifiedReceipt = verifyCircleAuthorizedGridAdmissionReceipt(committed.receipt, {
    gridPublicKey: grid.publicKey,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: issued.capability,
    authorization: issued.authorization,
    actor: PRINCIPAL,
    event: candidate.event,
    gridEvent: committed.event,
    chainVerification: store.verifyFullChain(),
    maxTtlSeconds: 120
  });
  assert.equal(verifiedReceipt.receipt_digest, committed.receipt_digest);
  assert.equal(verifiedReceipt.chain_verified, true);
  assert.equal(verifiedReceipt.authorization_bound, true);
});

test('exact token replay is idempotent but reissued token cannot impersonate durable admission', async t => {
  const fixture = await authorizationFixture();
  const candidate = proposalPersistenceCandidate(fixture);
  const { hypervisor, store } = await gridFixture(t);
  seedDurablePredecessors(store, fixture);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const firstGrant = issueCircleAuthorizedGridAdmissionCapability(hypervisor, {
    actor: PRINCIPAL,
    event: candidate.event,
    authorizationInput: fixture.input,
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds,
    ttlSeconds: 120
  });
  const first = commitCirclePersistenceWithAuthorizedAdmission({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: firstGrant.capability,
    authorization: firstGrant.authorization,
    actor: PRINCIPAL,
    event: candidate.event,
    nowSeconds,
    maxTtlSeconds: 120
  });
  const replay = commitCirclePersistenceWithAuthorizedAdmission({
    store,
    hypervisorPublicKey: hypervisor.publicKey,
    capability: firstGrant.capability,
    authorization: firstGrant.authorization,
    actor: PRINCIPAL,
    event: structuredClone(candidate.event),
    nowSeconds,
    maxTtlSeconds: 120
  });
  assert.equal(replay.event.seq, first.event.seq);
  assert.equal(eventCount(store), 3);

  const secondGrant = issueCircleAuthorizedGridAdmissionCapability(hypervisor, {
    actor: PRINCIPAL,
    event: candidate.event,
    authorizationInput: fixture.input,
    intentDigest: INTENT_DIGEST,
    planDigest: PLAN_DIGEST,
    policyDigest: POLICY_DIGEST,
    nowSeconds: nowSeconds + 1,
    ttlSeconds: 120
  });
  assert.notEqual(secondGrant.capability, firstGrant.capability);
  assert.throws(
    () => commitCirclePersistenceWithAuthorizedAdmission({
      store,
      hypervisorPublicKey: hypervisor.publicKey,
      capability: secondGrant.capability,
      authorization: secondGrant.authorization,
      actor: PRINCIPAL,
      event: candidate.event,
      nowSeconds: nowSeconds + 1,
      maxTtlSeconds: 120
    }),
    error => error.code === 'circle_authorized_admission_replay_mismatch' && error.status === 409
  );
  assert.equal(eventCount(store), 3);
});
