const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const OUTCOME_STATES = new Set([
  'session',
  'denied',
  'blocked',
  'invalid',
  'unavailable',
  'conflict',
  'needs-confirmation',
  'needs-approval',
  'uncertain'
]);
const TONES = new Set(['ready', 'complete', 'pending', 'blocked', 'denied', 'uncertain']);

export function createHumanPresenter(contract) {
  validateHumanContract(contract);
  const stableContract = structuredClone(contract);
  return Object.freeze({
    contract: deepFreeze(stableContract),
    requestPreview: request => requestPreview(stableContract, request),
    intentSuccess: input => intentSuccess(stableContract, input),
    intentFailure: input => intentFailure(stableContract, input),
    approval: (record, now) => approval(stableContract, record, now),
    receipt: event => receipt(stableContract, event)
  });
}

export function validateHumanContract(contract) {
  exactObject(contract, 'human contract', [
    'schema',
    'version',
    'kernel_version',
    'status',
    'actions',
    'gateway_outcomes',
    'approval_states',
    'event_kinds',
    'unknown_event',
    'non_claims'
  ]);
  if (
    contract.schema !== 'axiom-one-human-contract.v1'
    || contract.version !== 1
    || contract.kernel_version !== '0.12.0-dev.1'
    || contract.status !== 'experimental-human-explanations'
  ) throw new TypeError('Human explanation contract identity is invalid');
  if (!plainObject(contract.actions) || Object.keys(contract.actions).length !== 1) {
    throw new TypeError('Human explanation action inventory is invalid');
  }
  const echo = contract.actions['system.echo'];
  exactObject(echo, 'system.echo explanation', [
    'label',
    'consequence',
    'effect',
    'provider',
    'destination',
    'information_scope',
    'external_egress',
    'cost',
    'retention',
    'timeout_ms',
    'cancellation',
    'reversibility',
    'required_confirmations',
    'independent_approval'
  ]);
  for (const field of [
    'label', 'consequence', 'effect', 'provider', 'destination',
    'information_scope', 'cost', 'retention', 'cancellation', 'reversibility'
  ]) requireText(echo[field], `system.echo ${field}`);
  if (
    echo.consequence !== 'non-consequential-local-test'
    || echo.external_egress !== false
    || echo.timeout_ms !== 10_000
    || !Array.isArray(echo.required_confirmations)
    || echo.required_confirmations.length !== 0
    || echo.independent_approval !== false
  ) throw new TypeError('Human explanation action boundary is weakened');
  if (!plainObject(contract.gateway_outcomes) || !Object.keys(contract.gateway_outcomes).length) {
    throw new TypeError('Human explanation outcome inventory is invalid');
  }
  for (const [code, outcome] of Object.entries(contract.gateway_outcomes)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(code)) {
      throw new TypeError('Human explanation outcome code is invalid');
    }
    exactObject(outcome, `outcome ${code}`, [
      'state', 'tone', 'title', 'summary', 'next_step', 'retry_same_request'
    ]);
    if (!OUTCOME_STATES.has(outcome.state) || !TONES.has(outcome.tone)) {
      throw new TypeError(`Human explanation outcome state is invalid: ${code}`);
    }
    for (const field of ['title', 'summary', 'next_step']) {
      requireText(outcome[field], `outcome ${code} ${field}`);
    }
    if (typeof outcome.retry_same_request !== 'boolean') {
      throw new TypeError(`Human explanation retry rule is invalid: ${code}`);
    }
  }
  if (!plainObject(contract.approval_states)) {
    throw new TypeError('Human explanation approval states are invalid');
  }
  for (const name of ['active', 'consumed', 'expired', 'unknown']) {
    const state = contract.approval_states[name];
    exactObject(state, `approval state ${name}`, ['tone', 'title', 'summary']);
    if (!TONES.has(state.tone)) throw new TypeError(`Approval tone is invalid: ${name}`);
    requireText(state.title, `approval state ${name} title`);
    requireText(state.summary, `approval state ${name} summary`);
  }
  if (!plainObject(contract.event_kinds) || !Object.keys(contract.event_kinds).length) {
    throw new TypeError('Human explanation event inventory is invalid');
  }
  for (const [kind, value] of Object.entries(contract.event_kinds)) {
    if (!/^[a-z][a-z0-9.-]+$/.test(kind) || !Array.isArray(value) || value.length !== 3) {
      throw new TypeError(`Human explanation event mapping is invalid: ${kind}`);
    }
    requireText(value[0], `event ${kind} title`);
    requireText(value[1], `event ${kind} summary`);
    if (!TONES.has(value[2])) throw new TypeError(`Event tone is invalid: ${kind}`);
  }
  exactObject(contract.unknown_event, 'unknown event', ['title', 'summary', 'tone']);
  requireText(contract.unknown_event.title, 'unknown event title');
  requireText(contract.unknown_event.summary, 'unknown event summary');
  if (contract.unknown_event.tone !== 'uncertain') {
    throw new TypeError('Unknown events must remain uncertain');
  }
  if (
    !Array.isArray(contract.non_claims)
    || contract.non_claims.length !== 5
    || contract.non_claims.some(value => typeof value !== 'string' || !value.length)
  ) throw new TypeError('Human explanation non-claims are invalid');
  return true;
}

function requestPreview(contract, request) {
  validateRequest(request);
  const action = contract.actions[request.action];
  if (!action) throw new TypeError('This preview cannot explain the requested action');
  return model({
    kind: 'request-preview',
    state: 'review',
    tone: 'pending',
    badge: 'Review before sending',
    title: action.label,
    summary: 'This is a browser explanation of the exact request, not an authoritative kernel plan or grant.',
    facts: [
      fact('Effect', action.effect),
      fact('Provider', action.provider),
      fact('Destination', action.destination),
      fact('Information', action.information_scope),
      fact('Purpose', request.purpose ?? 'operator-request'),
      fact('External transfer', action.external_egress ? 'Declared' : 'None'),
      fact('Cost', action.cost),
      fact('Retention', action.retention),
      fact('Browser timeout', `${action.timeout_ms / 1000} seconds`),
      fact('Cancellation', action.cancellation),
      fact('Reversibility', action.reversibility),
      fact('Confirmation', action.required_confirmations.length ? 'Required' : 'Not required'),
      fact('Independent approval', action.independent_approval ? 'Required' : 'Not required')
    ],
    guidance: [
      'Selecting Send authorizes only submission of the request shown here.',
      'The Gateway and active node policy remain authoritative and may deny it.',
      'Change request returns to editing without sending network traffic.'
    ],
    retrySameRequest: false
  });
}

function intentSuccess(contract, { request, response, idempotencyKey }) {
  validateRequest(request);
  requireRequestKey(idempotencyKey);
  if (!plainObject(response)) return unknownSuccess('The Gateway result was not an object.');
  const evidence = response.evidence;
  const valid = response.status === 'completed'
    && IDENTIFIER.test(response.intent_id ?? '')
    && IDENTIFIER.test(response.trace_id ?? '')
    && plainObject(evidence)
    && DIGEST.test(evidence.plan_digest ?? '')
    && DIGEST.test(evidence.execution_digest ?? '')
    && DIGEST.test(evidence.policy_digest ?? '');
  if (!valid) return unknownSuccess(
    'The result did not contain the exact completed evidence fields required for a success claim.'
  );
  const action = contract.actions[request.action];
  return model({
    kind: 'intent-outcome',
    state: 'completed',
    tone: 'complete',
    badge: response.idempotent_replay ? 'Existing result recovered' : 'Completed',
    title: `${action.label} completed`,
    summary: 'The reviewed request completed through the authenticated local policy and evidence path.',
    facts: [
      fact('Result', typeof response.message === 'string' ? response.message : 'Completed without a display message'),
      fact('Intent', response.intent_id),
      fact('Trace', response.trace_id),
      fact('Policy evidence', evidence.policy_digest),
      fact('Plan evidence', evidence.plan_digest),
      fact('Execution evidence', evidence.execution_digest),
      fact('Request replay', response.idempotent_replay ? 'Recovered using the same request key' : 'First accepted result')
    ],
    guidance: [
      'The active node policy, not this page, granted execution authority.',
      'The one-use capability was bound to the plan and local Sandbox audience.',
      'Raw result and evidence remain available below.'
    ],
    retrySameRequest: false
  });
}

function intentFailure(contract, { request, error, idempotencyKey }) {
  validateRequest(request);
  requireRequestKey(idempotencyKey);
  const code = typeof error?.code === 'string' ? error.code : 'unknown_gateway_failure';
  const outcome = contract.gateway_outcomes[code] ?? {
    state: 'uncertain',
    tone: 'uncertain',
    title: 'Outcome not understood',
    summary: 'The error code has no current plain-language mapping, so this preview makes no outcome claim.',
    next_step: 'Inspect the raw code and trace. Do not infer success or retry with a different request key.',
    retry_same_request: false
  };
  const details = plainObject(error?.details) ? error.details : {};
  const facts = [fact('Code', code)];
  if (IDENTIFIER.test(error?.traceId ?? '')) facts.push(fact('Trace', error.traceId));
  if (IDENTIFIER.test(details.intent_id ?? '')) facts.push(fact('Intent', details.intent_id));
  if (DIGEST.test(details.request_digest ?? '')) {
    facts.push(fact('Exact request binding', details.request_digest));
  }
  if (Number.isSafeInteger(details.required_confirmations)) {
    facts.push(fact('Confirmations required', String(details.required_confirmations)));
  }
  if (
    Array.isArray(details.required_confirmation_values)
    && details.required_confirmation_values.every(value => typeof value === 'string')
  ) facts.push(fact('Exact confirmation', details.required_confirmation_values.join(', ')));
  if (outcome.state === 'uncertain' || outcome.retry_same_request) {
    facts.push(fact('Recovery request key', idempotencyKey));
  }
  return model({
    kind: 'intent-outcome',
    state: outcome.state,
    tone: outcome.tone,
    badge: humanState(outcome.state),
    title: outcome.title,
    summary: outcome.summary,
    facts,
    guidance: [
      outcome.next_step,
      'This explanation does not override the structured Gateway error or raw evidence.'
    ],
    retrySameRequest: outcome.retry_same_request
  });
}

function approval(contract, record, now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(current.valueOf()) || !plainObject(record)) {
    return unknownApproval(contract);
  }
  let state = ['active', 'consumed'].includes(record.status) ? record.status : 'unknown';
  const expiry = validDate(record.expires_at) ? new Date(record.expires_at) : null;
  if (state === 'active' && !expiry) state = 'unknown';
  if (state === 'active' && expiry <= current) state = 'expired';
  const display = contract.approval_states[state];
  const facts = [];
  for (const [label, value] of [
    ['Approval', record.approval_id],
    ['Action', record.action],
    ['Requested by', record.requester],
    ['Approved by', record.approver],
    ['Exact request binding', record.request_digest],
    ['Expires', record.expires_at],
    ['Used by intent', record.consumed_by_intent],
    ['Used at', record.consumed_at]
  ]) if (typeof value === 'string' && value.length) facts.push(fact(label, value));
  return model({
    kind: 'approval',
    state,
    tone: display.tone,
    badge: humanState(state),
    title: display.title,
    summary: display.summary,
    facts,
    guidance: [
      state === 'active'
        ? 'This page can inspect the record but cannot grant, widen, renew, or self-approve it.'
        : 'This record cannot be reused as active authority.',
      'Inspect the raw record for exact identifiers and timestamps.'
    ],
    retrySameRequest: false
  });
}

function receipt(contract, event) {
  if (!plainObject(event)) return unknownReceipt(contract, 'unknown');
  const kind = typeof event.kind === 'string' ? event.kind : 'unknown';
  const mapping = contract.event_kinds[kind];
  const display = mapping
    ? { title: mapping[0], summary: mapping[1], tone: mapping[2] }
    : contract.unknown_event;
  const facts = [fact('Event kind', kind)];
  for (const [label, value] of [
    ['Occurred', event.occurred_at ?? event.created_at],
    ['Actor', event.actor],
    ['Subject', event.subject],
    ['Trace', event.trace_id],
    ['Event', event.event_id ?? event.id],
    ['Sequence', Number.isSafeInteger(event.seq) ? String(event.seq) : undefined]
  ]) if (typeof value === 'string' && value.length) facts.push(fact(label, value));
  return model({
    kind: 'receipt',
    state: mapping ? 'mapped' : 'unmapped',
    tone: display.tone,
    badge: mapping ? humanState(display.tone) : 'Unmapped',
    title: display.title,
    summary: display.summary,
    facts,
    guidance: [
      'Integrity-linked evidence shows what this node recorded; it does not prove an external statement is true.',
      'Raw event payload and chain identifiers remain available below.'
    ],
    retrySameRequest: false
  });
}

function unknownSuccess(reason) {
  return model({
    kind: 'intent-outcome',
    state: 'uncertain',
    tone: 'uncertain',
    badge: 'Unverified outcome',
    title: 'Completed outcome not verified',
    summary: reason,
    facts: [],
    guidance: ['Inspect the raw result and do not present it as completed.'],
    retrySameRequest: false
  });
}

function unknownApproval(contract) {
  const display = contract.approval_states.unknown;
  return model({
    kind: 'approval',
    state: 'unknown',
    tone: display.tone,
    badge: 'Unknown',
    title: display.title,
    summary: display.summary,
    facts: [],
    guidance: ['Inspect the raw record; do not treat it as active authority.'],
    retrySameRequest: false
  });
}

function unknownReceipt(contract, kind) {
  return model({
    kind: 'receipt',
    state: 'unmapped',
    tone: contract.unknown_event.tone,
    badge: 'Unmapped',
    title: contract.unknown_event.title,
    summary: contract.unknown_event.summary,
    facts: [fact('Event kind', kind)],
    guidance: ['Inspect the raw event; no human-readable outcome is claimed.'],
    retrySameRequest: false
  });
}

function model(value) {
  return deepFreeze({
    schema: 'axiom-one-human-view.v1',
    ...value
  });
}

function fact(label, value) {
  return { label, value: String(value) };
}

function humanState(value) {
  return String(value).replaceAll('-', ' ').replace(/(^|\s)\S/g, match => match.toUpperCase());
}

function validateRequest(request) {
  if (!plainObject(request) || !Object.hasOwn(request, 'action')) {
    throw new TypeError('Human explanation request is invalid');
  }
  if (typeof request.action !== 'string' || !/^[a-z][a-z0-9.-]+$/.test(request.action)) {
    throw new TypeError('Human explanation request action is invalid');
  }
  if (request.input !== undefined && !plainObject(request.input)) {
    throw new TypeError('Human explanation request input is invalid');
  }
  if (request.purpose !== undefined) requireText(request.purpose, 'request purpose');
  if (
    request.data_scopes !== undefined
    && (!Array.isArray(request.data_scopes) || request.data_scopes.some(value => typeof value !== 'string'))
  ) throw new TypeError('Human explanation request data scopes are invalid');
}

function requireRequestKey(value) {
  if (typeof value !== 'string' || value.length < 16 || value.length > 160) {
    throw new TypeError('Human explanation request key is invalid');
  }
}

function requireText(value, name) {
  if (typeof value !== 'string' || !value.length || value.length > 1000) {
    throw new TypeError(`${name} is invalid`);
  }
}

function validDate(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

function exactObject(value, name, keys) {
  if (!plainObject(value)) throw new TypeError(`${name} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) throw new TypeError(`${name} fields are invalid`);
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
