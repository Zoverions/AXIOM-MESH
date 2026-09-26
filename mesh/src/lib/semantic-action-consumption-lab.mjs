import { canonicalize, digestObject, sha256, ValidationError } from './canonical.mjs';

// Inert reference model for #1576 (semantic replay). This module is a LAB: it is
// not imported by Gateway, Hypervisor, Sandbox, or Grid, it is not registered in
// capabilities.json, and it never replaces the live jti-keyed capability
// consumption in capability-consumption.mjs. It models, and lets tests falsify,
// the gap between these separate predicates:
//   token_unused                  != semantic_action_not_yet_consumed
//   valid fresh token             != remaining authority for this semantic effect
//   effect admission committed    != external effect observed exactly once
// The security key is authorization instance + canonical effect identity +
// remaining execution budget. It never keys on model intent and never globally
// dedupes identical parameters.

export const SEMANTIC_ACTION_CONSUMPTION_LAB_RECEIPT_SCHEMA = 'axiom-semantic-action-consumption-lab-receipt.v0';
export const SEMANTIC_AUTHORIZATION_INSTANCE_LAB_SCHEMA = 'axiom-semantic-authorization-instance-lab.v0';
export const SEMANTIC_EFFECT_CANONICALIZATION_VERSION = 'axiom-effect-canon.v0';
export const SEMANTIC_EFFECT_PROTOCOLS = Object.freeze(['axiom.structured-effect.v0', 'mcp.tools-call.v0']);
export const SEMANTIC_EFFECT_PARAMETER_TYPES = Object.freeze(['id', 'decimal', 'text', 'boolean']);
export const SEMANTIC_ADMISSION_LIFECYCLE_STATES = Object.freeze([
  'admission_consumed', 'dispatch_started', 'effect_committed', 'effect_uncertain',
  'effect_observed', 'reconciled_absent', 'sink_rejected', 'aborted_before_dispatch'
]);

export const SEMANTIC_ACTION_CONSUMPTION_LAB_HARD_ZEROS = Object.freeze({
  authority_effect: 'none',
  execution_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
});
const RECEIPT_NON_AUTHORITY = Object.freeze({
  exactly_once_claimed: false,
  receipt_is_authority: false,
  token_is_authority: false
});

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,191}$/;
const ACTION = /^[a-z][a-z0-9_.-]{0,127}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const DECIMAL = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
export const SEMANTIC_SINK_IDEMPOTENCY = Object.freeze(['idempotency-key', 'none']);
const MAX_DECIMAL_DIGITS = 34;
// Invisible, bidi-control and non-tab/newline control characters make a text
// parameter ambiguous; the adapter refuses to pick an interpretation.
// Covers C0/C1 controls, soft hyphen, combining grapheme joiner, Arabic letter
// mark, Hangul fillers, Khmer/Mongolian invisibles, zero-width and bidi controls,
// word joiner / invisible operators, variation selectors, BOM, and tag characters.
const AMBIGUOUS_TEXT = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u2028-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/u;
const MAX_BUDGET = 16;
const MAX_SINK_ATTEMPTS = 8;

export class LabJsonNumber {
  constructor(raw) {
    this.raw = raw;
    Object.freeze(this);
  }
}

// ---------------------------------------------------------------------------
// Knowledge plane: versioned, protocol-specific canonical effect identity.
// ---------------------------------------------------------------------------

/** Build a frozen effect profile. Every declared parameter is required. */
export function buildSemanticEffectProfile(input) {
  return failClosedThrow(() => {
    exact(input, 'effect profile', ['action', 'mcp_tool_name', 'consequential', 'sink_idempotency', 'parameters']);
    if (!SEMANTIC_SINK_IDEMPOTENCY.includes(input.sink_idempotency)) {
      throw new ValidationError('profile sink_idempotency must be declared');
    }
    const action = match(input.action, ACTION, 'profile action');
    const mcpToolName = match(input.mcp_tool_name, ACTION, 'profile mcp_tool_name');
    if (input.consequential !== true) {
      throw new ValidationError('Lab v0 only models consequential effect profiles');
    }
    const parameters = plain(input.parameters, 'profile parameters');
    const names = Object.keys(parameters);
    if (names.length === 0 || names.length > 32) throw new ValidationError('profile parameters are out of bounds');
    const types = {};
    for (const name of names) {
      match(name, ACTION, 'profile parameter name');
      if (!SEMANTIC_EFFECT_PARAMETER_TYPES.includes(parameters[name])) {
        throw new ValidationError(`profile parameter ${name} type is unsupported`);
      }
      types[name] = parameters[name];
    }
    return deepFreeze({
      action, mcp_tool_name: mcpToolName, consequential: true, sink_idempotency: input.sink_idempotency, parameters: types
    });
  });
}

/**
 * Canonicalize one proposed effect. Returns the canonical tuple and its digest.
 * The digest never includes the protocol, JSON-RPC request id, nonce, token, or
 * holder, so protocol-shape variation cannot manufacture a new action identity.
 * Any ambiguity throws ValidationError (fail closed for consequential effects).
 */
export function canonicalSemanticEffect(request, profiles) {
  return failClosedThrow(() => {
    exact(request, 'effect request', ['canonicalization_version', 'protocol', 'input']);
    if (request.canonicalization_version !== SEMANTIC_EFFECT_CANONICALIZATION_VERSION) {
      throw new ValidationError('canonicalization version is unknown; failing closed');
    }
    const profileList = profileArray(profiles);
    const input = typeof request.input === 'string' ? parseStrictJson(request.input) : request.input;
    let shape;
    if (request.protocol === 'axiom.structured-effect.v0') {
      shape = structuredShape(input, profileList);
    } else if (request.protocol === 'mcp.tools-call.v0') {
      shape = mcpShape(input, profileList);
    } else {
      throw new ValidationError('effect protocol is unknown; failing closed');
    }
    const effect = {
      canonicalization_version: SEMANTIC_EFFECT_CANONICALIZATION_VERSION,
      action: shape.profile.action,
      purpose: match(shape.purpose, ID, 'effect purpose'),
      destination: match(shape.destination, ID, 'effect destination'),
      object: match(shape.object, ID, 'effect object'),
      parameters: canonicalParameters(shape.parameters, shape.profile)
    };
    // sink_idempotency is a property of the action profile, not of the effect
    // identity; it is pinned durably at admission and never taken per call.
    return deepFreeze({ effect, effect_identity_digest: digestObject(effect), sink_idempotency: shape.profile.sink_idempotency });
  });
}

function profileArray(profiles) {
  if (!Array.isArray(profiles) || profiles.length === 0 || profiles.length > 64) {
    throw new ValidationError('effect profiles are required');
  }
  return profiles.map(profile => buildSemanticEffectProfile(profile));
}

function structuredShape(input, profiles) {
  exact(input, 'structured effect', ['action', 'purpose', 'destination', 'object', 'parameters']);
  const matches = profiles.filter(profile => profile.action === input.action);
  if (matches.length !== 1) throw new ValidationError('structured effect action has no unique profile');
  return { profile: matches[0], ...input };
}

function mcpShape(input, profiles) {
  exact(input, 'MCP effect', ['message', 'purpose', 'destination', 'object']);
  const message = exact(input.message, 'MCP message', ['jsonrpc', 'id', 'method', 'params']);
  if (message.jsonrpc !== '2.0' || message.method !== 'tools/call') {
    throw new ValidationError('MCP message is not a tools/call request');
  }
  // The JSON-RPC id is transport correlation only and is deliberately excluded.
  if (!((typeof message.id === 'string' && message.id.length <= 256) || isIntegerLike(message.id))) {
    throw new ValidationError('MCP request id is invalid');
  }
  const params = exact(message.params, 'MCP params', ['name', 'arguments', '_meta'], ['_meta']);
  if (params._meta !== undefined) {
    // Only the transport progress token is tolerated; any other metadata could
    // carry effect-relevant meaning, so it fails closed.
    const meta = exact(params._meta, 'MCP _meta', ['progressToken']);
    const token = meta.progressToken;
    if (!((typeof token === 'string' && ID.test(token)) || isIntegerLike(token))) {
      throw new ValidationError('MCP progressToken must be a bounded string or integer');
    }
  }
  const matches = profiles.filter(profile => profile.mcp_tool_name === params.name);
  if (matches.length !== 1) throw new ValidationError('MCP tool has no unique profile');
  return {
    profile: matches[0],
    purpose: input.purpose,
    destination: input.destination,
    object: input.object,
    parameters: params.arguments
  };
}

function canonicalParameters(value, profile) {
  const parameters = plain(value, 'effect parameters');
  const declared = Object.keys(profile.parameters);
  for (const key of Object.keys(parameters)) {
    if (!Object.hasOwn(profile.parameters, key)) {
      throw new ValidationError(`effect parameter ${key} is undeclared; failing closed`);
    }
  }
  const output = {};
  for (const name of declared.sort()) {
    if (!Object.hasOwn(parameters, name)) {
      // Absent-versus-default is ambiguous, so every declared parameter is required.
      throw new ValidationError(`effect parameter ${name} is missing; failing closed`);
    }
    output[name] = canonicalValue(parameters[name], profile.parameters[name], name);
  }
  return output;
}

function canonicalValue(value, type, name) {
  if (type === 'id') return match(value, ID, `effect parameter ${name}`);
  if (type === 'boolean') {
    if (typeof value !== 'boolean') throw new ValidationError(`effect parameter ${name} must be a JSON boolean`);
    return value;
  }
  if (type === 'text') {
    if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
      throw new ValidationError(`effect parameter ${name} must be bounded text`);
    }
    if (AMBIGUOUS_TEXT.test(value)) {
      throw new ValidationError(`effect parameter ${name} contains ambiguous characters; failing closed`);
    }
    // Canonical Unicode equivalence (NFC) is the adapter-defined text equivalence.
    return value.normalize('NFC');
  }
  if (type === 'decimal') return canonicalDecimal(value, name);
  throw new ValidationError(`effect parameter ${name} type is unsupported`);
}

function canonicalDecimal(value, name) {
  // Numbers must be integers (JS safe integers or integer JSON tokens); any
  // fractional value must use the lab decimal-string form. A JS number has no
  // lexical form, so the literal 9e1 is simply the integer 90, while the
  // lexical exponent forms "9e1" (string) and 9e1 (JSON token) fail closed.
  let raw;
  if (value instanceof LabJsonNumber) {
    if (!INTEGER.test(value.raw)) {
      throw new ValidationError(`effect parameter ${name} JSON number must be an integer; use a decimal string; failing closed`);
    }
    raw = value.raw;
  } else if (typeof value === 'string') raw = value;
  else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new ValidationError(`effect parameter ${name} number must be a safe integer; use a decimal string; failing closed`);
    }
    raw = String(value);
  } else {
    throw new ValidationError(`effect parameter ${name} must be a decimal`);
  }
  if (!DECIMAL.test(raw)) {
    throw new ValidationError(`effect parameter ${name} decimal form is ambiguous; failing closed`);
  }
  const negative = raw.startsWith('-');
  const [integer, fraction = ''] = (negative ? raw.slice(1) : raw).split('.');
  if (integer.length + fraction.length > MAX_DECIMAL_DIGITS) {
    throw new ValidationError(`effect parameter ${name} decimal has too many digits; failing closed`);
  }
  let end = fraction.length;
  while (end > 0 && fraction[end - 1] === '0') end -= 1;
  const trimmed = fraction.slice(0, end);
  const magnitude = trimmed ? `${integer}.${trimmed}` : integer;
  return negative && magnitude !== '0' ? `-${magnitude}` : magnitude;
}

/**
 * Strict JSON text parser used for protocol payloads. Duplicate object keys,
 * trailing data, and lone surrogates fail closed; numbers are returned as
 * LabJsonNumber so no precision is silently lost before canonicalization.
 */
export function parseStrictJson(text) {
  if (typeof text !== 'string' || text.length > 65_536) throw new ValidationError('effect JSON text is invalid');
  let index = 0;
  const STRING = /"(?:[^"\\\u0000-\u001F]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
  const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  const skip = () => { while (index < text.length && ' \t\n\r'.includes(text[index])) index += 1; };
  const fail = () => { throw new ValidationError('effect JSON text is malformed or ambiguous; failing closed'); };
  const readString = () => {
    STRING.lastIndex = index;
    const found = STRING.exec(text);
    if (!found) fail();
    index = STRING.lastIndex;
    const decoded = JSON.parse(found[0]);
    if (!decoded.isWellFormed()) fail();
    return decoded;
  };
  const readValue = depth => {
    if (depth > 32) fail();
    skip();
    const char = text[index];
    if (char === '{') {
      index += 1;
      const object = Object.create(null);
      skip();
      if (text[index] === '}') { index += 1; return Object.assign({}, object); }
      for (;;) {
        skip();
        if (text[index] !== '"') fail();
        const key = readString();
        if (Object.hasOwn(object, key)) fail();
        skip();
        if (text[index] !== ':') fail();
        index += 1;
        object[key] = readValue(depth + 1);
        skip();
        if (text[index] === ',') { index += 1; continue; }
        if (text[index] === '}') { index += 1; break; }
        fail();
      }
      const record = {};
      for (const key of Object.keys(object)) {
        Object.defineProperty(record, key, { value: object[key], enumerable: true, writable: true, configurable: true });
      }
      return record;
    }
    if (char === '[') {
      index += 1;
      const array = [];
      skip();
      if (text[index] === ']') { index += 1; return array; }
      for (;;) {
        array.push(readValue(depth + 1));
        skip();
        if (text[index] === ',') { index += 1; continue; }
        if (text[index] === ']') { index += 1; break; }
        fail();
      }
      return array;
    }
    if (char === '"') return readString();
    for (const [literal, value] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(literal, index)) { index += literal.length; return value; }
    }
    NUMBER.lastIndex = index;
    const number = NUMBER.exec(text);
    if (!number) fail();
    index = NUMBER.lastIndex;
    return new LabJsonNumber(number[0]);
  };
  return failClosedThrow(() => {
    const value = readValue(0);
    skip();
    if (index !== text.length) fail();
    return value;
  });
}

// ---------------------------------------------------------------------------
// Authority plane (lab only): authorization instance bound to one effect and
// one monotonically consumed execution budget.
// ---------------------------------------------------------------------------

const INSTANCE_BODY = Object.freeze([
  'authorization_instance_id', 'mandate_digest', 'principal_id', 'effect_identity_digest',
  'execution_budget', 'issued_at', 'expires_at'
]);
const INSTANCE_HEADER = Object.freeze({
  schema: SEMANTIC_AUTHORIZATION_INSTANCE_LAB_SCHEMA,
  version: 0,
  status: 'inert-reference-model',
  canonicalization_version: SEMANTIC_EFFECT_CANONICALIZATION_VERSION
});
const INSTANCE_FIELDS = Object.freeze([
  ...Object.keys(INSTANCE_HEADER), ...INSTANCE_BODY, ...Object.keys(SEMANTIC_ACTION_CONSUMPTION_LAB_HARD_ZEROS)
]);

/** Build an inert lab authorization instance; header and hard zeros are pinned. */
export function buildSemanticAuthorizationInstance(input) {
  return failClosedThrow(() => {
    exact(input, 'authorization instance input', INSTANCE_BODY);
    const document = { ...INSTANCE_HEADER, ...snapshot(input), ...SEMANTIC_ACTION_CONSUMPTION_LAB_HARD_ZEROS };
    validateSemanticAuthorizationInstance(document);
    return deepFreeze(document);
  });
}

export function validateSemanticAuthorizationInstance(document) {
  return failClosedThrow(() => {
    exact(document, 'authorization instance', INSTANCE_FIELDS);
    for (const [field, value] of Object.entries({ ...INSTANCE_HEADER, ...SEMANTIC_ACTION_CONSUMPTION_LAB_HARD_ZEROS })) {
      if (document[field] !== value) throw new ValidationError(`authorization instance ${field} is invalid`);
    }
    match(document.authorization_instance_id, ID, 'authorization_instance_id');
    match(document.mandate_digest, DIGEST, 'mandate_digest');
    match(document.principal_id, ID, 'principal_id');
    match(document.effect_identity_digest, DIGEST, 'effect_identity_digest');
    if (!Number.isSafeInteger(document.execution_budget) || document.execution_budget < 1
      || document.execution_budget > MAX_BUDGET) {
      throw new ValidationError('execution_budget is out of bounds');
    }
    const issued = instant(document.issued_at, 'issued_at');
    const expires = instant(document.expires_at, 'expires_at');
    if (expires <= issued) throw new ValidationError('expires_at must follow issued_at');
    return document;
  });
}

export function semanticAuthorizationInstanceDigest(document) {
  return digestObject(validateSemanticAuthorizationInstance(document));
}

// ---------------------------------------------------------------------------
// Operation plane (lab only): durable, monotonic, CAS-serialized ledger.
// ---------------------------------------------------------------------------

/**
 * Reference store. Values are stored as canonical JSON text so every read is a
 * fresh copy. Any shared store with the same read/compareAndSwap contract (for
 * example a SQLite table with a conditional UPDATE) serializes admissions
 * across evaluators and replicas.
 */
export function createInMemorySemanticLabStore() {
  const rows = new Map();
  return Object.freeze({
    read(key) {
      const row = rows.get(key);
      return row ? { version: row.version, value: JSON.parse(row.text) } : null;
    },
    compareAndSwap(key, expectedVersion, value) {
      const row = rows.get(key);
      const current = row ? row.version : 0;
      if (current !== expectedVersion) return false;
      rows.set(key, { version: current + 1, text: JSON.stringify(canonicalize(value)) });
      return true;
    }
  });
}

const PRESENTATION_FIELDS = Object.freeze([
  'jti', 'nonce', 'holder_id', 'authorization_instance_id', 'effect_identity_digest', 'issued_at', 'expires_at'
]);

/**
 * Create one evaluator over a shared store. Several evaluators (workers,
 * replicas, delegated children, restarted processes) may share one store; all
 * durable state lives in the store, none in the evaluator.
 */
export function createSemanticActionConsumptionLab({
  store,
  profiles,
  now = () => Date.now(),
  interleave = async () => {},
  maxAttempts = 16
} = {}) {
  if (!store || typeof store.read !== 'function' || typeof store.compareAndSwap !== 'function') {
    throw new ValidationError('semantic lab store with read/compareAndSwap is required');
  }
  const profileList = profileArray(profiles);

  async function mutate(key, transition, label) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const current = await store.read(key);
      await interleave({ key, label, attempt });
      const result = transition(current ? current.value : null);
      if (result.next === undefined) return result.output;
      if (await store.compareAndSwap(key, current ? current.version : 0, result.next)) return result.output;
    }
    return deny('ledger_contention');
  }

  async function registerAuthorizationInstance(documentInput) {
    return guard(async () => {
      const document = validateSemanticAuthorizationInstance(snapshot(documentInput));
      const digest = digestObject(document);
      const key = instanceKey(document.authorization_instance_id);
      // Step 1: claim the instance id as `pending` (never admittable). An
      // instance conflict stops here, before any mandate is bound.
      const claimed = await mutate(key, current => {
        if (current === null) {
          return {
            next: { status: 'pending', instance: document, instance_digest: digest, consumed: 0, aborted: false, presentations: [], admissions: [] },
            output: null
          };
        }
        if (current.instance_digest !== digest) return { output: deny('authorization_instance_conflict') };
        // Idempotent re-registration never resets or replenishes the budget.
        if (current.status === 'active') {
          return { output: freeze({ decision: 'already_registered', authorization_instance_digest: digest }) };
        }
        return { output: null };
      }, 'register-claim');
      if (claimed) return claimed;
      // Step 2: bind the mandate to exactly this instance. On conflict the
      // instance stays pending forever and can never admit.
      const mandate = await mutate(`mandate:${document.mandate_digest}`, current => {
        if (current === null) {
          return { next: { authorization_instance_id: document.authorization_instance_id, authorization_instance_digest: digest }, output: null };
        }
        if (current.authorization_instance_digest === digest) return { output: null };
        return { output: deny('mandate_already_bound') };
      }, 'register-mandate');
      if (mandate) return mandate;
      // Step 3: activate. A crash between steps is completed by retrying the same registration.
      return mutate(key, current => {
        if (current === null || current.instance_digest !== digest) return { output: deny('authorization_instance_conflict') };
        if (current.status === 'active') {
          return { output: freeze({ decision: 'already_registered', authorization_instance_digest: digest }) };
        }
        return { next: { ...current, status: 'active' }, output: freeze({ decision: 'registered', authorization_instance_digest: digest }) };
      }, 'register-activate');
    });
  }

  async function admit(input) {
    return guard(async () => {
      const request = exact(snapshotOrThrow(input), 'admission request', ['presentation', 'effect']);
      const presentation = exact(request.presentation, 'presentation', PRESENTATION_FIELDS);
      match(presentation.jti, ID, 'presentation jti');
      match(presentation.nonce, ID, 'presentation nonce');
      match(presentation.holder_id, ID, 'presentation holder_id');
      match(presentation.authorization_instance_id, ID, 'presentation authorization_instance_id');
      match(presentation.effect_identity_digest, DIGEST, 'presentation effect_identity_digest');
      let canonical;
      try {
        canonical = canonicalSemanticEffect(request.effect, profileList);
      } catch {
        return deny('canonicalization_ambiguous');
      }
      if (canonical.effect_identity_digest !== presentation.effect_identity_digest) return deny('effect_mismatch');
      const at = now();
      if (!(instant(presentation.issued_at, 'presentation issued_at') <= at
        && at < instant(presentation.expires_at, 'presentation expires_at'))) {
        return deny('token_not_current');
      }
      const jtiDigest = sha256(presentation.jti);
      return mutate(instanceKey(presentation.authorization_instance_id), record => {
        if (record === null) return { output: deny('unknown_authorization_instance') };
        if (record.status !== 'active') return { output: deny('authorization_instance_pending') };
        const instance = record.instance;
        if (instance.effect_identity_digest !== canonical.effect_identity_digest) {
          return { output: deny('effect_not_authorized') };
        }
        if (!(Date.parse(instance.issued_at) <= at && at < Date.parse(instance.expires_at))) {
          return { output: deny('authorization_not_current') };
        }
        if (record.aborted) return { output: deny('authorization_aborted') };
        const last = record.admissions.at(-1);
        // Predicate 1: token_unused. A literal replay never consumes budget.
        if (record.presentations.includes(jtiDigest)) {
          return { output: priorOrDeny(record, last, 'token_replayed') };
        }
        // Predicate 2: semantic_action_not_yet_consumed, independent of predicate 1.
        if (record.consumed >= instance.execution_budget) {
          return { output: priorOrDeny(record, last, 'semantic_budget_exhausted') };
        }
        if (last && ['admission_consumed', 'dispatch_started', 'effect_uncertain'].includes(last.state)) {
          return { output: priorOrDeny(record, last, 'prior_admission_unresolved') };
        }
        // presentations only grow on admission, so their length is bounded by execution_budget (<= 16).
        const ordinal = record.consumed + 1;
        const admission = {
          admission_ordinal: ordinal,
          receipt_id: `sacl_${digestObject({ instance_digest: record.instance_digest, ordinal })}`,
          idempotency_key: digestObject({
            purpose: 'axiom-semantic-effect-idempotency.v0',
            authorization_instance_digest: record.instance_digest,
            effect_identity_digest: instance.effect_identity_digest,
            admission_ordinal: ordinal
          }),
          presentation_jti_digest: jtiDigest,
          holder_id: presentation.holder_id,
          sink_idempotency: canonical.sink_idempotency,
          redelivery_blocked: false,
          admitted_at: new Date(at).toISOString(),
          state: 'admission_consumed',
          effect_committed: 'no',
          effect_observed: 'not_observed',
          reconciliation: 'not_required',
          abort_state: 'none',
          sink_attempts: 0
        };
        const next = {
          ...record,
          consumed: ordinal,
          presentations: [...record.presentations, jtiDigest],
          admissions: [...record.admissions, admission]
        };
        return { next, output: freeze({ decision: 'admit', perform: true, receipt: receiptOf(next, admission) }) };
      }, 'admit');
    });
  }

  function admissionTransition(label, input, fields, step) {
    return guard(async () => {
      const request = exact(snapshotOrThrow(input), `${label} request`, [
        'authorization_instance_id', 'receipt_id', 'admitting_jti', ...fields
      ]);
      match(request.authorization_instance_id, ID, 'authorization_instance_id');
      match(request.receipt_id, /^sacl_[a-f0-9]{64}$/, 'receipt_id');
      const admittingJtiDigest = sha256(match(request.admitting_jti, ID, 'admitting_jti'));
      return mutate(instanceKey(request.authorization_instance_id), record => {
        if (record === null) return { output: deny('unknown_authorization_instance') };
        const index = record.admissions.findIndex(item => item.receipt_id === request.receipt_id);
        if (index < 0) return { output: deny('unknown_admission') };
        const admission = record.admissions[index];
        // receipt_id is derivable, so knowing it is not authority: every
        // follow-up transition must present the jti that made the admission.
        if (admission.presentation_jti_digest !== admittingJtiDigest) return { output: deny('admitting_token_mismatch') };
        const result = step(record, admission, request);
        if (!result.change) return { output: result.output(receiptOf(record, admission)) };
        const updated = { ...admission, ...result.change };
        const admissions = record.admissions.map((item, position) => (position === index ? updated : item));
        const next = { ...record, admissions };
        return { next, output: result.output(receiptOf(next, updated)) };
      }, label);
    });
  }

  function beginDispatch(input) {
    return admissionTransition('dispatch', input, [], (record, admission) => {
      // Abort dominates: an aborted instance never starts a dispatch.
      if (record.aborted || admission.state === 'aborted_before_dispatch') {
        return {
          change: admission.state === 'admission_consumed'
            ? { state: 'aborted_before_dispatch', abort_state: 'aborted_before_dispatch' }
            : undefined,
          output: receipt => deny('authorization_aborted', receipt)
        };
      }
      if (admission.state !== 'admission_consumed') {
        return { output: receipt => deny('dispatch_already_started', receipt) };
      }
      return {
        change: { state: 'dispatch_started', sink_attempts: 1 },
        output: receipt => freeze({ decision: 'dispatch', perform: true, idempotency_key: admission.idempotency_key, receipt })
      };
    });
  }

  function recordSinkOutcome(input) {
    return admissionTransition('sink-outcome', input, ['outcome'], (record, admission, request) => {
      if (!['committed', 'unknown', 'rejected'].includes(request.outcome)) {
        return { output: receipt => deny('invalid_input', receipt) };
      }
      if (!['dispatch_started', 'effect_uncertain'].includes(admission.state)) {
        return { output: receipt => deny('sink_outcome_out_of_order', receipt) };
      }
      const change = request.outcome === 'committed'
        ? { state: 'effect_committed', effect_committed: 'yes', reconciliation: admission.state === 'effect_uncertain' ? 'reconciled_by_sink_ack' : 'not_required' }
        : request.outcome === 'unknown'
          ? { state: 'effect_uncertain', effect_committed: 'unknown', reconciliation: 'required' }
          : { state: 'sink_rejected', effect_committed: 'no' };
      return { change, output: receipt => freeze({ decision: 'recorded', perform: false, receipt }) };
    });
  }

  /**
   * Downstream adapter retry after timeout/unknown result. Sink idempotency is
   * pinned at admission from the effect profile; the per-call flag is only a
   * declaration that must match it. Redelivery is allowed only for a pinned
   * `idempotency-key` sink, with the stable key, never after abort, and never
   * once redelivery was blocked. Every other retry makes the admission
   * effect-uncertain and blocks redelivery until reconciliation (which is
   * terminal), so the sink is never called again.
   */
  function retryDispatch(input) {
    return admissionTransition('retry', input, ['sink_idempotent'], (record, admission, request) => {
      if (typeof request.sink_idempotent !== 'boolean') return { output: receipt => deny('invalid_input', receipt) };
      if (!['dispatch_started', 'effect_uncertain'].includes(admission.state)) {
        return { output: receipt => deny('retry_not_applicable', receipt) };
      }
      const uncertain = { state: 'effect_uncertain', effect_committed: 'unknown', reconciliation: 'required', redelivery_blocked: true };
      if (record.aborted) {
        return { change: { ...uncertain, abort_state: 'abort_after_dispatch' }, output: receipt => deny('authorization_aborted', receipt) };
      }
      const pinnedIdempotent = admission.sink_idempotency === 'idempotency-key';
      if (request.sink_idempotent !== pinnedIdempotent) {
        return { change: uncertain, output: receipt => deny('sink_idempotency_mismatch', receipt) };
      }
      if (!pinnedIdempotent || admission.redelivery_blocked) {
        return { change: uncertain, output: receipt => deny('effect_uncertain_requires_reconciliation', receipt) };
      }
      if (admission.sink_attempts >= MAX_SINK_ATTEMPTS) {
        return { change: uncertain, output: receipt => deny('sink_attempts_exhausted', receipt) };
      }
      return {
        change: { sink_attempts: admission.sink_attempts + 1 },
        output: receipt => freeze({ decision: 'redeliver', perform: true, idempotency_key: admission.idempotency_key, receipt })
      };
    });
  }

  function recordObservation(input) {
    return admissionTransition('observation', input, ['observed', 'evidence_digest'], (record, admission, request) => {
      match(request.evidence_digest, DIGEST, 'evidence_digest');
      if (request.observed === 'present') {
        if (!['dispatch_started', 'effect_committed', 'effect_uncertain'].includes(admission.state)) {
          return { output: receipt => deny('observation_out_of_order', receipt) };
        }
        return {
          change: {
            state: 'effect_observed',
            effect_observed: 'observed_present',
            reconciliation: admission.state === 'effect_committed' ? admission.reconciliation : 'reconciled_present'
          },
          output: receipt => freeze({ decision: 'recorded', perform: false, receipt })
        };
      }
      if (request.observed === 'absent') {
        if (!['dispatch_started', 'effect_uncertain'].includes(admission.state)) {
          return { output: receipt => deny('observation_contradicts_state', receipt) };
        }
        // Absence is reconciled, but the consumed budget is never replenished.
        return {
          change: { state: 'reconciled_absent', effect_observed: 'observed_absent', effect_committed: 'no', reconciliation: 'reconciled_absent' },
          output: receipt => freeze({ decision: 'recorded', perform: false, receipt })
        };
      }
      return { output: receipt => deny('invalid_input', receipt) };
    });
  }

  function abort(input) {
    return guard(async () => {
      const request = exact(snapshotOrThrow(input), 'abort request', ['authorization_instance_id']);
      match(request.authorization_instance_id, ID, 'authorization_instance_id');
      return mutate(instanceKey(request.authorization_instance_id), record => {
        if (record === null) return { output: deny('unknown_authorization_instance') };
        if (record.aborted) return { output: freeze({ decision: 'already_aborted', perform: false }) };
        const admissions = record.admissions.map(item => {
          if (item.state === 'admission_consumed') {
            return { ...item, state: 'aborted_before_dispatch', abort_state: 'aborted_before_dispatch' };
          }
          if (['dispatch_started', 'effect_uncertain', 'effect_committed', 'effect_observed'].includes(item.state)) {
            return { ...item, abort_state: 'abort_after_dispatch' };
          }
          return item;
        });
        return { next: { ...record, aborted: true, admissions }, output: freeze({ decision: 'aborted', perform: false }) };
      }, 'abort');
    });
  }

  async function getReceipt(input) {
    return guard(async () => {
      const request = exact(snapshotOrThrow(input), 'receipt request', ['authorization_instance_id', 'receipt_id']);
      const current = await store.read(instanceKey(match(request.authorization_instance_id, ID, 'authorization_instance_id')));
      const admission = current?.value.admissions.find(item => item.receipt_id === request.receipt_id);
      if (!admission) return deny('unknown_admission');
      return freeze({ decision: 'receipt', perform: false, receipt: receiptOf(current.value, admission) });
    });
  }

  /** Read-only: remaining budget is derived only from durable state. */
  async function getBudget(input) {
    return guard(async () => {
      const request = exact(snapshotOrThrow(input), 'budget request', ['authorization_instance_id']);
      const current = await store.read(instanceKey(match(request.authorization_instance_id, ID, 'authorization_instance_id')));
      if (!current) return deny('unknown_authorization_instance');
      const record = current.value;
      return freeze({
        decision: 'budget',
        perform: false,
        status: record.status,
        aborted: record.aborted,
        execution_budget: record.instance.execution_budget,
        consumed: record.consumed,
        remaining: record.instance.execution_budget - record.consumed
      });
    });
  }

  // There is deliberately no refund, reset, delete, restore, or replenish
  // operation: remaining budget can only go down.
  return Object.freeze({
    registerAuthorizationInstance, admit, beginDispatch, recordSinkOutcome, retryDispatch,
    recordObservation, abort, getReceipt, getBudget
  });
}

function priorOrDeny(record, last, reason) {
  if (!last) return deny(reason);
  const receipt = receiptOf(record, last);
  if (['admission_consumed', 'dispatch_started', 'effect_uncertain'].includes(last.state)) {
    return deny(last.state === 'effect_uncertain' ? 'effect_uncertain_requires_reconciliation' : reason, receipt);
  }
  return freeze({ decision: 'prior_receipt', perform: false, reason, receipt });
}

function receiptOf(record, admission) {
  return deepFreeze({
    schema: SEMANTIC_ACTION_CONSUMPTION_LAB_RECEIPT_SCHEMA,
    version: 0,
    status: 'inert-reference-model',
    receipt_id: admission.receipt_id,
    authorization_instance_id: record.instance.authorization_instance_id,
    authorization_instance_digest: record.instance_digest,
    effect_identity_digest: record.instance.effect_identity_digest,
    canonicalization_version: record.instance.canonicalization_version,
    admission_ordinal: admission.admission_ordinal,
    execution_budget: record.instance.execution_budget,
    admissions_consumed: record.consumed,
    idempotency_key: admission.idempotency_key,
    presentation_jti_digest: admission.presentation_jti_digest,
    holder_id: admission.holder_id,
    admitted_at: admission.admitted_at,
    sink_idempotency: admission.sink_idempotency,
    redelivery_blocked: admission.redelivery_blocked,
    remaining_budget: record.instance.execution_budget - record.consumed,
    lifecycle_state: admission.state,
    admission_consumed: true,
    effect_committed: admission.effect_committed,
    effect_observed: admission.effect_observed,
    reconciliation: admission.reconciliation,
    abort_state: admission.abort_state,
    ...RECEIPT_NON_AUTHORITY,
    ...SEMANTIC_ACTION_CONSUMPTION_LAB_HARD_ZEROS
  });
}

// ---------------------------------------------------------------------------
// Helpers (fail closed: any unreadable input becomes a deny or ValidationError)
// ---------------------------------------------------------------------------

function deny(reason, receipt) {
  return freeze(receipt ? { decision: 'deny', perform: false, reason, receipt } : { decision: 'deny', perform: false, reason });
}

async function guard(run) {
  try {
    return await run();
  } catch {
    return deny('invalid_input');
  }
}

function failClosedThrow(run) {
  try {
    return run();
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('semantic lab input could not be read safely; failing closed');
  }
}

function instanceKey(id) {
  return `instance:${id}`;
}

function snapshot(value) {
  return JSON.parse(JSON.stringify(canonicalize(value)));
}

function snapshotOrThrow(value) {
  plain(value, 'request');
  return snapshotPreservingNumbers(value);
}

// Requests may carry LabJsonNumber instances or raw JSON strings inside the
// effect; keep them intact while still rejecting exotic objects.
function snapshotPreservingNumbers(value, depth = 0) {
  if (depth > 32) throw new ValidationError('request nesting is too deep');
  if (value instanceof LabJsonNumber) return new LabJsonNumber(String(value.raw));
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new ValidationError('request array is exotic');
    return Array.from(value, item => snapshotPreservingNumbers(item, depth + 1));
  }
  const prototype = typeof value === 'object' ? Object.getPrototypeOf(value) : undefined;
  if (prototype !== Object.prototype && prototype !== null) throw new ValidationError('request object is exotic');
  if (Object.getOwnPropertySymbols(value).length) throw new ValidationError('request object has symbol keys');
  const output = {};
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(descriptor, 'value')) throw new ValidationError('request accessors are not allowed');
    Object.defineProperty(output, key, {
      value: snapshotPreservingNumbers(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true
    });
  }
  return output;
}

function isIntegerLike(value) {
  return (value instanceof LabJsonNumber && INTEGER.test(value.raw) && value.raw.length <= 16)
    || (typeof value === 'number' && Number.isSafeInteger(value));
}

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof LabJsonNumber) {
    throw new ValidationError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new ValidationError(`${label} must be a plain object`);
  return value;
}

function exact(value, label, allowed, optional = []) {
  const object = plain(value, label);
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of allowed) {
    if (!optional.includes(key) && !Object.hasOwn(object, key)) throw new ValidationError(`${label} is missing ${key}`);
  }
  return object;
}

function match(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function instant(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} is invalid`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) throw new ValidationError(`${label} must be canonical ISO time`);
  return ms;
}

function freeze(value) {
  return Object.freeze(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
