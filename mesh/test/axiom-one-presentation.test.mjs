import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createHumanPresenter,
  validateHumanContract
} from '../../apps/axiom-one/presentation.mjs';
import { GATEWAY_CLIENT_CONTRACT } from '../../packages/axiom-client/index.mjs';

const contract = JSON.parse(await readFile(
  new URL('../../apps/axiom-one/human-contract.json', import.meta.url),
  'utf8'
));
const request = Object.freeze({
  action: 'system.echo',
  input: Object.freeze({ message: 'explain this request' }),
  purpose: 'human-explanation-test'
});
const requestKey = 'axiom-one:human-explanation-0001';

test('human explanation contract exactly covers stable errors and kernel events', () => {
  assert.equal(validateHumanContract(contract), true);
  assert.deepEqual(
    Object.keys(contract.gateway_outcomes).sort(),
    [...GATEWAY_CLIENT_CONTRACT.error_contract.stable_codes].sort()
  );
  assert.equal(Object.keys(contract.gateway_outcomes).length, 20);
  assert.equal(Object.keys(contract.event_kinds).length, 37);
  assert.deepEqual(Object.keys(contract.actions), ['system.echo']);
  assert.equal(
    contract.non_claims.includes('authoritative-pre-execution-kernel-plan'),
    true
  );

  const weakened = structuredClone(contract);
  weakened.actions['system.echo'].external_egress = true;
  assert.throws(() => validateHumanContract(weakened), /boundary is weakened/);

  const missingOutcome = structuredClone(contract);
  delete missingOutcome.gateway_outcomes.request_timeout;
  assert.equal(validateHumanContract(missingOutcome), true);
  assert.notDeepEqual(
    Object.keys(missingOutcome.gateway_outcomes).sort(),
    [...GATEWAY_CLIENT_CONTRACT.error_contract.stable_codes].sort()
  );
});

test('request review names every bounded effect without granting authority', () => {
  const presenter = createHumanPresenter(contract);
  const preview = presenter.requestPreview(request);
  assert.equal(preview.schema, 'axiom-one-human-view.v1');
  assert.equal(preview.kind, 'request-preview');
  assert.equal(preview.state, 'review');
  assert.equal(preview.badge, 'Review before sending');
  assert.match(preview.summary, /not an authoritative kernel plan or grant/);
  const facts = Object.fromEntries(preview.facts.map(item => [item.label, item.value]));
  assert.match(facts.Provider, /No external provider/);
  assert.match(facts.Destination, /local Sandbox/);
  assert.equal(facts['External transfer'], 'None');
  assert.equal(facts.Confirmation, 'Not required');
  assert.equal(facts['Independent approval'], 'Not required');
  assert.match(facts.Retention, /encrypted local intent result/);
  assert.match(facts.Cancellation, /same request key/);
  assert.equal(Object.isFrozen(preview), true);
  assert.equal(Object.isFrozen(preview.facts), true);

  assert.throws(
    () => presenter.requestPreview({ ...request, action: 'capsule.revoke' }),
    /cannot explain/
  );
  assert.throws(
    () => presenter.requestPreview({ action: 'system.echo', input: [] }),
    /input is invalid/
  );
});

test('completed intents require exact policy, plan, and execution evidence', () => {
  const presenter = createHumanPresenter(contract);
  const response = {
    intent_id: `intent_${'a'.repeat(64)}`,
    trace_id: 'trace_human_explanation_0001',
    status: 'completed',
    message: 'explain this request',
    evidence: {
      plan_digest: 'b'.repeat(64),
      execution_digest: 'c'.repeat(64),
      policy_digest: 'd'.repeat(64)
    }
  };
  const completed = presenter.intentSuccess({ request, response, idempotencyKey: requestKey });
  assert.equal(completed.state, 'completed');
  assert.equal(completed.tone, 'complete');
  assert.equal(completed.badge, 'Completed');
  assert.match(completed.guidance[0], /node policy/);

  const recovered = presenter.intentSuccess({
    request,
    response: { ...response, idempotent_replay: true },
    idempotencyKey: requestKey
  });
  assert.equal(recovered.badge, 'Existing result recovered');

  for (const invalid of [
    { ...response, status: 'pending' },
    { ...response, trace_id: '' },
    { ...response, evidence: { ...response.evidence, plan_digest: 'not-a-digest' } }
  ]) {
    const outcome = presenter.intentSuccess({
      request,
      response: invalid,
      idempotencyKey: requestKey
    });
    assert.equal(outcome.state, 'uncertain');
    assert.equal(outcome.badge, 'Unverified outcome');
  }
});

test('denial, approval, confirmation, and uncertainty mappings fail closed', () => {
  const presenter = createHumanPresenter(contract);
  for (const code of GATEWAY_CLIENT_CONTRACT.error_contract.stable_codes) {
    const outcome = presenter.intentFailure({
      request,
      error: { code, traceId: 'trace_human_explanation_0002' },
      idempotencyKey: requestKey
    });
    assert.equal(outcome.schema, 'axiom-one-human-view.v1');
    assert.notEqual(outcome.state, 'completed');
    assert.equal(typeof outcome.retrySameRequest, 'boolean');
    assert.equal(outcome.facts.some(item => item.value === code), true);
  }

  const confirmation = presenter.intentFailure({
    request,
    error: {
      code: 'confirmation_required',
      details: {
        intent_id: `intent_${'e'.repeat(64)}`,
        required_confirmations: 1,
        required_confirmation_values: ['confirm:capsule.revoke']
      }
    },
    idempotencyKey: requestKey
  });
  assert.equal(confirmation.state, 'needs-confirmation');
  assert.equal(confirmation.retrySameRequest, false);
  assert.equal(
    confirmation.facts.some(item => item.value === 'confirm:capsule.revoke'),
    true
  );

  const approval = presenter.intentFailure({
    request,
    error: {
      code: 'independent_approval_required',
      details: { request_digest: 'f'.repeat(64) }
    },
    idempotencyKey: requestKey
  });
  assert.equal(approval.state, 'needs-approval');
  assert.match(approval.guidance[0], /cannot self-approve/);

  for (const code of [
    'dependency_unavailable',
    'request_cancelled',
    'request_timeout',
    'invalid_gateway_response'
  ]) {
    const uncertain = presenter.intentFailure({
      request,
      error: { code },
      idempotencyKey: requestKey
    });
    assert.equal(uncertain.state, 'uncertain');
    assert.equal(uncertain.retrySameRequest, true);
    assert.equal(
      uncertain.facts.some(item => item.value === requestKey),
      true
    );
  }

  const unknown = presenter.intentFailure({
    request,
    error: { code: 'future_kernel_failure', message: 'do not expose me' },
    idempotencyKey: requestKey
  });
  assert.equal(unknown.state, 'uncertain');
  assert.equal(unknown.retrySameRequest, false);
  assert.doesNotMatch(JSON.stringify(unknown), /do not expose me/);
});

test('approval explanations distinguish active, expired, consumed, and unknown', () => {
  const presenter = createHumanPresenter(contract);
  const base = {
    approval_id: 'approval_human_0001',
    approver: 'independent-reviewer',
    requester: 'local-user',
    action: 'capsule.revoke',
    request_digest: '1'.repeat(64),
    expires_at: '2026-08-01T12:30:00.000Z'
  };
  const beforeExpiry = new Date('2026-08-01T12:00:00.000Z');
  const afterExpiry = new Date('2026-08-01T13:00:00.000Z');
  assert.equal(presenter.approval({ ...base, status: 'active' }, beforeExpiry).state, 'active');
  assert.equal(presenter.approval({ ...base, status: 'active' }, afterExpiry).state, 'expired');
  const consumed = presenter.approval({
    ...base,
    status: 'consumed',
    consumed_by_intent: `intent_${'2'.repeat(64)}`,
    consumed_at: '2026-08-01T12:10:00.000Z'
  }, beforeExpiry);
  assert.equal(consumed.state, 'consumed');
  assert.match(consumed.summary, /cannot authorize another request/);
  assert.equal(presenter.approval({ ...base, status: 'future' }, beforeExpiry).state, 'unknown');
  assert.equal(
    presenter.approval({ ...base, status: 'active', expires_at: 'not-a-date' }, beforeExpiry).state,
    'unknown'
  );
  assert.equal(
    presenter.approval({ ...base, status: 'active', expires_at: undefined }, beforeExpiry).state,
    'unknown'
  );
  assert.equal(presenter.approval(null, beforeExpiry).state, 'unknown');
});

test('every current event kind is readable and unknown kinds remain unmapped', () => {
  const presenter = createHumanPresenter(contract);
  for (const kind of Object.keys(contract.event_kinds)) {
    const explanation = presenter.receipt({
      seq: 1,
      event_id: `event_${'3'.repeat(64)}`,
      trace_id: 'trace_human_explanation_0003',
      actor: 'local-user',
      kind,
      subject: 'subject-1',
      occurred_at: '2026-08-01T12:00:00.000Z',
      payload: { private_detail: 'raw-only' }
    });
    assert.equal(explanation.state, 'mapped');
    assert.equal(explanation.facts.some(item => item.value === kind), true);
    assert.doesNotMatch(JSON.stringify(explanation), /private_detail|raw-only/);
  }
  const unknown = presenter.receipt({ kind: 'future.event' });
  assert.equal(unknown.state, 'unmapped');
  assert.equal(unknown.tone, 'uncertain');
  assert.match(unknown.summary, /makes no plain-language claim/);
});
