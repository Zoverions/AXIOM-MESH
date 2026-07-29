import { createPublicKey, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import { verifyCausalBundle } from './causal-sync.mjs';
import { verifyObjectSignature } from './identity.mjs';
import { DataProtector } from './protector.mjs';

const CONFIG_SCHEMA = 'axiom-online-causal-sync-config.v1';
const STATE_SCHEMA = 'axiom-online-causal-sync-state.v1';
const STATUS_SCHEMA = 'axiom-online-causal-sync-status.v1';
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const APPROVAL_ID = /^approval_[A-Za-z0-9_-]{16,160}$/;
const MAX_CONFIG_BYTES = 65_536;
const MAX_REMOTE_BYTES = 1_048_576;
const MAX_STATE_BYTES = 16_777_216;
const LOCK_STALE_MS = 5 * 60_000;

export async function loadOnlineCausalSyncRuntime(configPath, {
  allowInsecureLoopback = false
} = {}) {
  const path = absolutePath(configPath, 'online sync config path');
  const serialized = await privateFile(path, MAX_CONFIG_BYTES, 'Online sync config');
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new ValidationError('Online sync config must contain valid JSON');
  }
  const config = normalizeConfig(parsed, { allowInsecureLoopback });
  const [
    sourceToken,
    destinationToken,
    stateKey
  ] = await Promise.all([
    privateToken(config.source.token_file, 'Source API token'),
    privateToken(config.destination.token_file, 'Destination API token'),
    privateFile(config.state_key_file, 4_096, 'Online sync state key')
  ]);
  const sourceGridPublicKeys = await Promise.all(
    config.source.grid_public_key_files.map((path, index) => regularFile(
      path,
      8_192,
      `Source Grid public key ${index + 1}`
    ))
  );
  for (const sourceGridPublicKey of sourceGridPublicKeys) {
    let publicKey;
    try {
      publicKey = createPublicKey(sourceGridPublicKey);
    } catch {
      throw new ValidationError('Source Grid public key is invalid');
    }
    if (publicKey.asymmetricKeyType !== 'ed25519') {
      throw new ValidationError('Source Grid public key must use Ed25519');
    }
  }
  const key = Buffer.from(stateKey.trim(), 'base64url');
  if (key.length !== 32) {
    throw new ValidationError('Online sync state key must contain 32 bytes');
  }
  const sourceGridKeyDigests = sourceGridPublicKeys.map(sha256);
  const directionId = sha256(canonicalJson({
    owner: config.owner,
    source_origin: config.source.origin,
    destination_origin: config.destination.origin
  }));
  return Object.freeze({
    config_path: path,
    config,
    source_token: sourceToken,
    destination_token: destinationToken,
    source_grid_public_keys: Object.freeze([...sourceGridPublicKeys]),
    source_grid_key_digests: Object.freeze([...sourceGridKeyDigests]),
    source_grid_key_digest: sourceGridKeyDigests[0],
    direction_id: directionId,
    protector: new DataProtector(key)
  });
}

export async function pollOnlineCausalSync(runtime, {
  fetchImpl = fetch,
  now = Date.now()
} = {}) {
  return withStateLock(runtime, now, async () => {
    const state = await loadState(runtime, now);
    if (
      state.failure?.blocked
      || (
        state.failure
        && Date.parse(state.failure.next_attempt_at) > now
      )
    ) {
      return publicStatus(state, runtime, 'backing_off');
    }
    try {
      const response = await requestJson({
        fetchImpl,
        origin: runtime.config.source.origin,
        path: `/v1/events?after=${state.source_cursor}`
          + `&limit=${runtime.config.max_events_per_poll}`,
        token: runtime.source_token,
        timeoutMs: runtime.config.request_timeout_ms
      });
      if (response.status !== 200) {
        throw remoteFailure('source', response);
      }
      const payload = assertPlainObject(response.payload, 'source event response');
      if (
        !Array.isArray(payload.events)
        || payload.events.length > runtime.config.max_events_per_poll
      ) {
        throw new ValidationError('Source event response exceeds the configured limit');
      }
      let previousSeq = state.source_cursor;
      let queueSaturated = false;
      for (const rawEvent of payload.events) {
        const event = verifySourceEvent(
          rawEvent,
          runtime.config.owner,
          runtime.source_grid_public_keys
        );
        if (event.seq <= previousSeq) {
          throw new ValidationError('Source events are not strictly ordered');
        }
        if (event.kind === 'sync.bundle.applied') {
          const staged = stageSourceBundle(state, event, runtime, now);
          if (staged === 'capacity') {
            queueSaturated = true;
            break;
          }
          if (staged === 'candidate') {
            const destination = await lookupDestinationBundle(
              runtime,
              event.payload.bundle_digest,
              fetchImpl
            );
            if (destination) {
              recordReceipt(state, {
                bundle_digest: event.payload.bundle_digest,
                source_seq: event.seq,
                outcome: 'already_present',
                destination_intent_id: null,
                completed_at: isoNow(now)
              });
            } else {
              state.pending.push(pendingBundle(event));
            }
          }
        }
        state.source_cursor = event.seq;
        previousSeq = event.seq;
      }
      if (!queueSaturated) state.failure = null;
      state.updated_at = isoNow(now);
      await saveState(runtime, state);
      return publicStatus(
        state,
        runtime,
        queueSaturated ? 'queue_saturated' : 'polled'
      );
    } catch (error) {
      recordFailure(state, error, runtime.config.retry, now);
      await saveState(runtime, state);
      return publicStatus(state, runtime, 'failed');
    }
  });
}

export async function applyOnlineCausalSyncBundle(runtime, {
  bundleDigest,
  approvalId,
  fetchImpl = fetch,
  now = Date.now()
}) {
  const digest = assertString(bundleDigest, 'bundle digest', {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
  const approval = assertString(approvalId, 'approval id', {
    max: 180,
    pattern: APPROVAL_ID
  });
  return withStateLock(runtime, now, async () => {
    const state = await loadState(runtime, now);
    const pending = state.pending[0];
    if (!pending) {
      throw new AxiomError(
        'online_sync_queue_empty',
        'No online causal bundle is awaiting approval',
        409
      );
    }
    if (pending.bundle_digest !== digest) {
      throw new AxiomError(
        'online_sync_order_required',
        'Online causal bundles must be applied in source-event order',
        409,
        { expected_bundle_digest: pending.bundle_digest }
      );
    }
    const existing = await lookupDestinationBundle(runtime, digest, fetchImpl);
    if (existing) {
      completePending(state, pending, {
        outcome: 'already_present',
        destination_intent_id: null,
        completedAt: now
      });
      await saveState(runtime, state);
      return publicStatus(state, runtime, 'already_present');
    }
    const intent = onlineSyncIntent(pending.bundle);
    if (digestObject({
      action: intent.action,
      input: intent.input,
      purpose: intent.purpose,
      data_scopes: intent.data_scopes
    }) !== pending.request_digest) {
      throw new ValidationError('Pending online sync request digest is invalid');
    }
    const response = await requestJson({
      fetchImpl,
      origin: runtime.config.destination.origin,
      path: '/v1/intents',
      token: runtime.destination_token,
      method: 'POST',
      timeoutMs: runtime.config.request_timeout_ms,
      headers: {
        'idempotency-key': `online-sync-${sha256(`${digest}\n${approval}`)}`
      },
      body: {
        ...intent,
        confirmations: ['confirm:sync.apply'],
        approval_ids: [approval]
      }
    });
    if (response.status === 409 && response.payload?.error?.code === 'sync_bundle_replayed') {
      const raced = await lookupDestinationBundle(runtime, digest, fetchImpl);
      if (raced) {
        completePending(state, pending, {
          outcome: 'already_present',
          destination_intent_id: response.payload?.intent_id ?? null,
          completedAt: now
        });
        await saveState(runtime, state);
        return publicStatus(state, runtime, 'already_present');
      }
    }
    if (response.status !== 200) throw remoteFailure('destination', response);
    if (
      response.payload?.status !== 'completed'
      || response.payload?.bundle_digest !== digest
    ) {
      throw new ValidationError('Destination returned an invalid online sync result');
    }
    completePending(state, pending, {
      outcome: 'applied',
      destination_intent_id: response.payload.intent_id ?? null,
      completedAt: now
    });
    state.failure = null;
    await saveState(runtime, state);
    return publicStatus(state, runtime, 'applied');
  });
}

export async function resetOnlineCausalSyncRetry(runtime, {
  now = Date.now()
} = {}) {
  return withStateLock(runtime, now, async () => {
    const state = await loadState(runtime, now);
    state.failure = null;
    state.updated_at = isoNow(now);
    await saveState(runtime, state);
    return publicStatus(state, runtime, 'retry_reset');
  });
}

export async function onlineCausalSyncStatus(runtime, {
  now = Date.now()
} = {}) {
  return publicStatus(await loadState(runtime, now), runtime, 'status');
}

export function onlineSyncIntent(bundle) {
  const verified = verifyCausalBundle(bundle);
  const dataScopes = [...new Set(
    verified.updates.map(update => `sync:${update.statement.namespace}`)
  )].sort();
  return {
    action: 'sync.apply',
    input: { bundle: structuredClone(bundle) },
    purpose: 'online-causal-exchange',
    data_scopes: dataScopes
  };
}

function normalizeConfig(input, { allowInsecureLoopback }) {
  const value = assertPlainObject(input, 'online sync config');
  if (value.schema !== CONFIG_SCHEMA) {
    throw new ValidationError(`Online sync config schema must be ${CONFIG_SCHEMA}`);
  }
  const source = endpointConfig(value.source, 'source', {
    gridKeyRequired: true,
    allowInsecureLoopback
  });
  const destination = endpointConfig(value.destination, 'destination', {
    gridKeyRequired: false,
    allowInsecureLoopback
  });
  if (source.origin === destination.origin) {
    throw new ValidationError('Online sync source and destination must be different origins');
  }
  return Object.freeze({
    schema: CONFIG_SCHEMA,
    owner: assertString(value.owner, 'owner', {
      max: 160,
      pattern: ID
    }),
    source,
    destination,
    state_file: absolutePath(value.state_file, 'state_file'),
    state_key_file: absolutePath(value.state_key_file, 'state_key_file'),
    poll_interval_ms: boundedInteger(
      value.poll_interval_ms ?? 5_000,
      'poll_interval_ms',
      1_000,
      300_000
    ),
    request_timeout_ms: boundedInteger(
      value.request_timeout_ms ?? 10_000,
      'request_timeout_ms',
      1_000,
      30_000
    ),
    max_events_per_poll: boundedInteger(
      value.max_events_per_poll ?? 100,
      'max_events_per_poll',
      1,
      100
    ),
    max_pending_bundles: boundedInteger(
      value.max_pending_bundles ?? 128,
      'max_pending_bundles',
      1,
      256
    ),
    max_pending_bytes: boundedInteger(
      value.max_pending_bytes ?? 8_388_608,
      'max_pending_bytes',
      900_000,
      12_582_912
    ),
    retry: retryConfig(value.retry ?? {})
  });
}

function endpointConfig(input, name, {
  gridKeyRequired,
  allowInsecureLoopback
}) {
  const value = assertPlainObject(input, name);
  const origin = exactOrigin(value.origin, `${name}.origin`, allowInsecureLoopback);
  const gridPublicKeyFiles = gridKeyRequired
    ? normalizeGridPublicKeyFiles(value, name)
    : null;
  return Object.freeze({
    origin,
    token_file: absolutePath(value.token_file, `${name}.token_file`),
    ...(gridKeyRequired ? {
      grid_public_key_files: Object.freeze(gridPublicKeyFiles)
    } : {})
  });
}

function normalizeGridPublicKeyFiles(value, name) {
  if (
    value.grid_public_key_file !== undefined
    && value.grid_public_key_files !== undefined
  ) {
    throw new ValidationError(
      `${name} must configure only one Grid public-key file form`
    );
  }
  const raw = value.grid_public_key_files ?? (
    value.grid_public_key_file === undefined
      ? null
      : [value.grid_public_key_file]
  );
  if (
    !Array.isArray(raw)
    || raw.length < 1
    || raw.length > 8
  ) {
    throw new ValidationError(
      `${name}.grid_public_key_files must contain 1-8 paths`
    );
  }
  const paths = raw.map((path, index) => absolutePath(
    path,
    `${name}.grid_public_key_files[${index}]`
  ));
  if (new Set(paths).size !== paths.length) {
    throw new ValidationError(`${name} Grid public-key paths must be unique`);
  }
  return paths;
}

function retryConfig(input) {
  const value = assertPlainObject(input, 'retry');
  const baseMs = boundedInteger(value.base_ms ?? 1_000, 'retry.base_ms', 100, 60_000);
  const maximumMs = boundedInteger(
    value.maximum_ms ?? 60_000,
    'retry.maximum_ms',
    baseMs,
    3_600_000
  );
  return Object.freeze({
    base_ms: baseMs,
    maximum_ms: maximumMs,
    maximum_attempts: boundedInteger(
      value.maximum_attempts ?? 10,
      'retry.maximum_attempts',
      1,
      100
    )
  });
}

function exactOrigin(value, name, allowInsecureLoopback) {
  const raw = assertString(value, name, { max: 2_048 });
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError(`${name} must be an absolute URL origin`);
  }
  const isLoopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (
    url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || (
      url.protocol !== 'https:'
      && !(allowInsecureLoopback && url.protocol === 'http:' && isLoopback)
    )
  ) {
    throw new ValidationError(
      `${name} must be an exact HTTPS origin without credentials or path`
    );
  }
  return url.origin;
}

function verifySourceEvent(input, expectedOwner, sourceGridPublicKeys) {
  const value = assertPlainObject(input, 'source event');
  const seq = boundedInteger(value.seq, 'source event seq', 1, Number.MAX_SAFE_INTEGER);
  const event = {
    seq,
    event_id: assertString(value.event_id, 'source event id', {
      max: 160,
      pattern: ID
    }),
    trace_id: assertString(value.trace_id, 'source event trace id', {
      max: 160,
      pattern: ID
    }),
    actor: assertString(value.actor, 'source event actor', {
      max: 160,
      pattern: ID
    }),
    kind: assertString(value.kind, 'source event kind', {
      max: 160,
      pattern: /^[a-z][a-z0-9.-]{1,159}$/
    }),
    subject: assertString(value.subject, 'source event subject', {
      max: 160,
      pattern: ID
    }),
    occurred_at: canonicalTimestamp(value.occurred_at, 'source event occurred_at'),
    payload: structuredClone(assertPlainObject(value.payload, 'source event payload')),
    payload_digest: assertString(value.payload_digest, 'source event payload digest', {
      min: 64,
      max: 64,
      pattern: DIGEST
    }),
    prev_hash: assertString(value.prev_hash, 'source event previous hash', {
      min: 64,
      max: 64,
      pattern: DIGEST
    }),
    event_hash: assertString(value.event_hash, 'source event hash', {
      min: 64,
      max: 64,
      pattern: DIGEST
    }),
    signature: structuredClone(
      assertPlainObject(value.signature, 'source event signature')
    )
  };
  if (event.actor !== expectedOwner) {
    throw new ValidationError('Source event actor does not match the configured owner');
  }
  if (digestObject(event.payload) !== event.payload_digest) {
    throw new ValidationError('Source event payload digest is invalid');
  }
  const envelope = {
    seq: event.seq,
    event_id: event.event_id,
    trace_id: event.trace_id,
    actor: event.actor,
    kind: event.kind,
    subject: event.subject,
    occurred_at: event.occurred_at,
    payload_digest: event.payload_digest,
    prev_hash: event.prev_hash
  };
  if (digestObject(envelope) !== event.event_hash) {
    throw new ValidationError('Source event hash is invalid');
  }
  if (!sourceGridPublicKeys.some(sourceGridPublicKey => verifyObjectSignature(
    { event_hash: event.event_hash },
    event.signature,
    sourceGridPublicKey
  ))) {
    throw new ValidationError('Source Grid event signature is invalid');
  }
  if (event.kind === 'sync.bundle.applied') {
    const payload = assertPlainObject(event.payload, 'source sync event payload');
    if (payload.owner !== expectedOwner) {
      throw new ValidationError('Source sync bundle owner is invalid');
    }
    const verified = verifyCausalBundle(payload.bundle, {
      expectedOwner
    });
    if (
      payload.bundle_digest !== verified.bundle_digest
      || event.subject !== verified.bundle_digest
    ) {
      throw new ValidationError('Source sync event does not bind its bundle digest');
    }
  }
  return event;
}

function stageSourceBundle(state, event, runtime, now) {
  const bundleDigest = event.payload.bundle_digest;
  if (
    state.pending.some(item => item.bundle_digest === bundleDigest)
    || state.receipts.some(item => item.bundle_digest === bundleDigest)
  ) return 'known';
  const candidate = pendingBundle(event);
  const bytes = state.pending.reduce((total, item) => total + item.bytes, 0);
  if (
    state.pending.length >= runtime.config.max_pending_bundles
    || bytes + candidate.bytes > runtime.config.max_pending_bytes
  ) {
    state.failure = {
      code: 'online_sync_queue_capacity',
      attempts: 0,
      blocked: true,
      last_failure_at: isoNow(now),
      next_attempt_at: isoNow(now)
    };
    return 'capacity';
  }
  return 'candidate';
}

function pendingBundle(event) {
  const bundle = structuredClone(event.payload.bundle);
  const verified = verifyCausalBundle(bundle);
  const intent = onlineSyncIntent(bundle);
  return {
    source_seq: event.seq,
    source_event_id: event.event_id,
    source_event_hash: event.event_hash,
    bundle_digest: verified.bundle_digest,
    source_node_id: verified.statement.source_node_id,
    update_count: verified.updates.length,
    namespaces: [...new Set(
      verified.updates.map(update => update.statement.namespace)
    )].sort(),
    bytes: Buffer.byteLength(canonicalJson(bundle)),
    request_digest: digestObject({
      action: intent.action,
      input: intent.input,
      purpose: intent.purpose,
      data_scopes: intent.data_scopes
    }),
    bundle
  };
}

async function lookupDestinationBundle(runtime, bundleDigest, fetchImpl) {
  const response = await requestJson({
    fetchImpl,
    origin: runtime.config.destination.origin,
    path: `/v1/sync/bundles/${bundleDigest}`,
    token: runtime.destination_token,
    timeoutMs: runtime.config.request_timeout_ms
  });
  if (response.status === 404 && response.payload?.error?.code === 'sync_bundle_not_found') {
    return null;
  }
  if (response.status !== 200) throw remoteFailure('destination', response);
  if (
    response.payload?.bundle_digest !== bundleDigest
    || response.payload?.owner !== runtime.config.owner
  ) {
    throw new ValidationError('Destination returned an invalid sync bundle record');
  }
  return response.payload;
}

function completePending(state, pending, {
  outcome,
  destination_intent_id: destinationIntentId,
  completedAt
}) {
  state.pending.shift();
  recordReceipt(state, {
    bundle_digest: pending.bundle_digest,
    source_seq: pending.source_seq,
    outcome,
    destination_intent_id: destinationIntentId,
    completed_at: isoNow(completedAt)
  });
  state.failure = null;
  state.updated_at = isoNow(completedAt);
}

function recordReceipt(state, receipt) {
  state.receipts.push(receipt);
  if (state.receipts.length > 256) {
    state.receipts.splice(0, state.receipts.length - 256);
  }
}

function recordFailure(state, error, retry, now) {
  const attempts = Math.min(
    (state.failure?.attempts ?? 0) + 1,
    retry.maximum_attempts
  );
  const delay = Math.min(
    retry.maximum_ms,
    retry.base_ms * (2 ** Math.max(0, attempts - 1))
  );
  state.failure = {
    code: safeFailureCode(error),
    attempts,
    blocked: attempts >= retry.maximum_attempts,
    last_failure_at: isoNow(now),
    next_attempt_at: isoNow(now + delay)
  };
  state.updated_at = isoNow(now);
}

function safeFailureCode(error) {
  if (error instanceof ValidationError) return 'online_sync_evidence_invalid';
  if (typeof error?.code === 'string' && /^[a-z0-9_]{1,80}$/.test(error.code)) {
    return error.code;
  }
  return 'online_sync_remote_unavailable';
}

function publicStatus(state, runtime, outcome) {
  return {
    schema: STATUS_SCHEMA,
    direction_id: runtime.direction_id,
    owner: runtime.config.owner,
    source_origin: runtime.config.source.origin,
    destination_origin: runtime.config.destination.origin,
    source_grid_key_digest: runtime.source_grid_key_digest,
    source_grid_key_digests: [...runtime.source_grid_key_digests],
    outcome,
    source_cursor: state.source_cursor,
    pending_count: state.pending.length,
    pending_bytes: state.pending.reduce((total, item) => total + item.bytes, 0),
    pending: state.pending.map(item => ({
      source_seq: item.source_seq,
      bundle_digest: item.bundle_digest,
      source_node_id: item.source_node_id,
      update_count: item.update_count,
      namespaces: [...item.namespaces],
      request_digest: item.request_digest
    })),
    failure: state.failure ? { ...state.failure } : null,
    receipts: state.receipts.map(item => ({ ...item })),
    updated_at: state.updated_at
  };
}

async function loadState(runtime, now) {
  let serialized;
  try {
    serialized = await readFile(runtime.config.state_file, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return emptyState(runtime, now);
  }
  if (Buffer.byteLength(serialized) > MAX_STATE_BYTES) {
    throw new ValidationError('Online sync state exceeds the byte limit');
  }
  const value = runtime.protector.open(
    serialized,
    stateContext(runtime.direction_id)
  );
  return normalizeState(value, runtime);
}

async function saveState(runtime, state) {
  const normalized = normalizeState(state, runtime);
  const sealed = runtime.protector.seal(
    normalized,
    stateContext(runtime.direction_id)
  );
  await atomicReplace(runtime.config.state_file, `${sealed}\n`, 0o600);
}

function emptyState(runtime, now) {
  return {
    schema: STATE_SCHEMA,
    direction_id: runtime.direction_id,
    source_cursor: 0,
    pending: [],
    receipts: [],
    failure: null,
    updated_at: isoNow(now)
  };
}

function normalizeState(input, runtime) {
  const value = assertPlainObject(input, 'online sync state');
  if (
    value.schema !== STATE_SCHEMA
    || value.direction_id !== runtime.direction_id
  ) {
    throw new ValidationError('Online sync state belongs to a different direction');
  }
  const pending = Array.isArray(value.pending)
    ? value.pending.map(normalizePending)
    : invalidState('pending');
  const receipts = Array.isArray(value.receipts)
    ? value.receipts.map(normalizeReceipt)
    : invalidState('receipts');
  if (
    pending.length > runtime.config.max_pending_bundles
    || receipts.length > 256
    || pending.reduce((total, item) => total + item.bytes, 0)
      > runtime.config.max_pending_bytes
  ) {
    throw new ValidationError('Online sync state exceeds configured bounds');
  }
  for (let index = 1; index < pending.length; index += 1) {
    if (pending[index].source_seq <= pending[index - 1].source_seq) {
      throw new ValidationError('Pending online sync bundles are not ordered');
    }
  }
  return {
    schema: STATE_SCHEMA,
    direction_id: runtime.direction_id,
    source_cursor: boundedInteger(
      value.source_cursor,
      'source_cursor',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    pending,
    receipts,
    failure: value.failure === null ? null : normalizeFailure(value.failure),
    updated_at: canonicalTimestamp(value.updated_at, 'state updated_at')
  };
}

function normalizePending(input) {
  const value = assertPlainObject(input, 'pending bundle');
  const bundle = structuredClone(assertPlainObject(value.bundle, 'pending bundle payload'));
  const verified = verifyCausalBundle(bundle);
  if (verified.bundle_digest !== value.bundle_digest) {
    throw new ValidationError('Pending bundle digest is invalid');
  }
  const normalized = pendingBundle({
    seq: value.source_seq,
    event_id: value.source_event_id,
    event_hash: value.source_event_hash,
    payload: {
      bundle,
      bundle_digest: value.bundle_digest
    }
  });
  if (
    normalized.source_node_id !== value.source_node_id
    || normalized.update_count !== value.update_count
    || canonicalJson(normalized.namespaces) !== canonicalJson(value.namespaces)
    || normalized.bytes !== value.bytes
    || normalized.request_digest !== value.request_digest
  ) {
    throw new ValidationError('Pending bundle metadata is invalid');
  }
  return normalized;
}

function normalizeReceipt(input) {
  const value = assertPlainObject(input, 'online sync receipt');
  return {
    bundle_digest: assertString(value.bundle_digest, 'receipt bundle digest', {
      min: 64,
      max: 64,
      pattern: DIGEST
    }),
    source_seq: boundedInteger(
      value.source_seq,
      'receipt source seq',
      1,
      Number.MAX_SAFE_INTEGER
    ),
    outcome: assertString(value.outcome, 'receipt outcome', {
      max: 32,
      pattern: /^(applied|already_present)$/
    }),
    destination_intent_id: value.destination_intent_id === null
      ? null
      : assertString(value.destination_intent_id, 'destination intent id', {
          max: 160,
          pattern: ID
        }),
    completed_at: canonicalTimestamp(value.completed_at, 'receipt completed_at')
  };
}

function normalizeFailure(input) {
  const value = assertPlainObject(input, 'online sync failure');
  if (typeof value.blocked !== 'boolean') {
    throw new ValidationError('Online sync failure blocked flag is invalid');
  }
  return {
    code: assertString(value.code, 'failure code', {
      max: 80,
      pattern: /^[a-z0-9_]+$/
    }),
    attempts: boundedInteger(value.attempts, 'failure attempts', 0, 100),
    blocked: value.blocked,
    last_failure_at: canonicalTimestamp(
      value.last_failure_at,
      'failure last_failure_at'
    ),
    next_attempt_at: canonicalTimestamp(
      value.next_attempt_at,
      'failure next_attempt_at'
    )
  };
}

async function requestJson({
  fetchImpl,
  origin,
  path,
  token,
  method = 'GET',
  timeoutMs,
  headers = {},
  body
}) {
  let response;
  try {
    response = await fetchImpl(`${origin}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(body === undefined ? {} : {
          'content-type': 'application/json'
        }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new AxiomError(
      'online_sync_remote_unavailable',
      'Online sync remote is unavailable',
      503
    );
  }
  const payload = await boundedJson(response, MAX_REMOTE_BYTES);
  return { status: response.status, payload };
}

async function boundedJson(response, maximumBytes) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ValidationError('Online sync remote did not return JSON');
  }
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new ValidationError('Online sync remote response exceeds the byte limit');
    }
    chunks.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ValidationError('Online sync remote returned invalid JSON');
  }
}

function remoteFailure(side, response) {
  const remoteCode = response.payload?.error?.code;
  return new AxiomError(
    `online_sync_${side}_rejected`,
    `Online sync ${side} rejected the request`,
    response.status,
    {
      remote_code: typeof remoteCode === 'string' ? remoteCode : 'unknown'
    }
  );
}

async function withStateLock(runtime, now, operation) {
  const lockPath = `${runtime.config.state_file}.lock`;
  const lock = await acquireLock(lockPath, now);
  try {
    return await operation();
  } finally {
    await lock.release();
  }
}

async function acquireLock(lockPath, now, allowReclaim = true) {
  await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    if (allowReclaim && await reclaimLock(lockPath, now)) {
      return acquireLock(lockPath, now, false);
    }
    throw new AxiomError(
      'online_sync_locked',
      'Another online sync process owns the state',
      409
    );
  }
  const nonce = randomUUID();
  const ownerPath = resolve(lockPath, 'owner.json');
  try {
    await writeFile(ownerPath, `${canonicalJson({
      schema: 'axiom-online-causal-sync-lock.v1',
      pid: process.pid,
      nonce,
      created_at: isoNow(now)
    })}\n`, { mode: 0o600, flag: 'wx' });
  } catch (error) {
    await rm(lockPath, { recursive: true, force: true });
    throw error;
  }
  return {
    async release() {
      let owner;
      try {
        owner = JSON.parse(await readFile(ownerPath, 'utf8'));
      } catch (error) {
        if (error?.code === 'ENOENT') return;
        throw error;
      }
      if (owner.nonce !== nonce || owner.pid !== process.pid) {
        throw new ValidationError('Online sync lock ownership changed');
      }
      const retired = `${lockPath}.released-${nonce}`;
      await rename(lockPath, retired);
      await rm(retired, { recursive: true, force: true });
    }
  };
}

async function reclaimLock(lockPath, now) {
  let owner;
  let age;
  try {
    owner = JSON.parse(await readFile(resolve(lockPath, 'owner.json'), 'utf8'));
    age = now - Date.parse(owner.created_at);
  } catch {
    try {
      age = now - (await stat(lockPath)).mtimeMs;
    } catch {
      return false;
    }
  }
  if (!Number.isFinite(age) || age < LOCK_STALE_MS || processIsActive(owner?.pid)) {
    return false;
  }
  const stale = `${lockPath}.stale-${randomUUID()}`;
  try {
    await rename(lockPath, stale);
  } catch {
    return false;
  }
  await rm(stale, { recursive: true, force: true });
  return true;
}

function processIsActive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function privateToken(path, label) {
  const value = (await privateFile(path, 1_024, label)).trim();
  if (value.length < 32 || value.length > 512 || /\s/.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

async function privateFile(path, maximumBytes, label) {
  return regularFile(path, maximumBytes, label, { requirePrivate: true });
}

async function regularFile(path, maximumBytes, label, {
  requirePrivate = false
} = {}) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new ValidationError(`${label} must be a bounded regular file`);
  }
  if (
    requirePrivate
    && process.platform !== 'win32'
    && (metadata.mode & 0o077) !== 0
  ) {
    throw new ValidationError(`${label} must not be accessible by group or others`);
  }
  return readFile(path, 'utf8');
}

async function atomicReplace(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { mode, flag: 'wx' });
  await rename(temporary, path);
}

function absolutePath(value, name) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new ValidationError(`${name} must be an absolute path`);
  }
  return resolve(value);
}

function stateContext(directionId) {
  return `axiom:online-causal-sync-state:${directionId}`;
}

function boundedInteger(value, name, minimum, maximum) {
  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new ValidationError(
      `${name} must be an integer between ${minimum} and ${maximum}`
    );
  }
  return value;
}

function canonicalTimestamp(value, name) {
  const raw = assertString(value, name, { max: 64 });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== raw) {
    throw new ValidationError(`${name} must be a canonical ISO timestamp`);
  }
  return raw;
}

function isoNow(value) {
  return new Date(value).toISOString();
}

function invalidState(field) {
  throw new ValidationError(`Online sync state ${field} is invalid`);
}

export {
  CONFIG_SCHEMA,
  STATE_SCHEMA,
  STATUS_SCHEMA
};
