import { assertPlainObject, assertString, canonicalJson, digestObject, ValidationError } from './lib/canonical.mjs';

const ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{15,159}$/;
const BEARER = /^[A-Za-z0-9._~+/-]+={0,2}$/;
const MAX_MESSAGE_BYTES = 8_192;
const MAX_RESPONSE_BYTES = 4_096;
const MAX_IDEMPOTENCY_ENTRIES = 5_000;
const MAP_SIZE_GETTER = Object.getOwnPropertyDescriptor(Map.prototype, 'size').get;

function exactFields(value, fields, name) {
  const object = assertPlainObject(value, name);
  for (const key of Object.keys(object)) {
    if (!fields.includes(key)) throw new ValidationError(`${name} contains unsupported field: ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(object, key)) throw new ValidationError(`${name} is missing field: ${key}`);
  }
  return object;
}

function fixedDestination(config) {
  const originText = assertString(config.origin, 'webhook origin', { max: 2048 });
  const destinationText = assertString(config.destination_url, 'webhook destination', { max: 2048 });
  let origin;
  let destination;
  try {
    origin = new URL(originText);
    destination = new URL(destinationText);
  } catch {
    throw new ValidationError('webhook destination URL is invalid');
  }
  if (origin.protocol !== 'https:' || originText !== origin.origin ||
      origin.username || origin.password || origin.search || origin.hash ||
      destination.protocol !== 'https:' || destination.origin !== origin.origin ||
      destination.username || destination.password || destination.search || destination.hash ||
      destination.pathname === '/' || destination.href !== destinationText) {
    throw new ValidationError('webhook destination must be an exact HTTPS path on the fixed origin');
  }
  return destination.href;
}

function attemptReceipt(command, state, endpointStatus = null) {
  return Object.freeze({
    schema: 'axiom-channel-webhook-attempt.v0',
    account_id: command.account_id,
    recipient_id: command.recipient_id,
    idempotency_key: command.idempotency_key,
    state,
    endpoint_status: endpointStatus,
    recipient_delivery_verified: false,
    recipient_confirmation_verified: false,
    mesh_authority_verified: false,
    external_effect_attempted: state !== 'cancelled_before_dispatch'
  });
}

async function discardBoundedResponse(response) {
  if (!response?.body) return;
  const reader = response.body.getReader();
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new ValidationError('webhook response exceeds byte limit');
    }
  }
}

/**
 * Narrow transport adapter. The caller must independently verify Mesh authority
 * and human recipient confirmation before invoking this unconnected sender.
 * The injected transport and in-memory idempotency state are operator-owned
 * test/configuration hooks, not inputs to a production authorization route.
 * Idempotency state does not survive a restart.
 * Effect-attempted terminal reservations are retained for the process lifetime.
 * New unique keys fail closed when this bounded state is full; the sender never
 * evicts a possibly-effectful key merely to make room.
 */
export function createFixedRecipientWebhookSender(rawConfig, {
  fetchImpl = globalThis.fetch,
  state = new Map()
} = {}) {
  const config = exactFields(rawConfig, [
    'account_id', 'recipient_id', 'origin', 'destination_url', 'credential', 'timeout_ms'
  ], 'webhook sender config');
  const accountId = assertString(config.account_id, 'webhook account_id', { max: 160, pattern: ACCOUNT });
  const recipientId = assertString(config.recipient_id, 'webhook recipient_id', { max: 160, pattern: ACCOUNT });
  const destination = fixedDestination(config);
  const credential = assertString(config.credential, 'webhook credential', { max: 512, pattern: BEARER });
  if (!Number.isInteger(config.timeout_ms) || config.timeout_ms < 1 || config.timeout_ms > 30_000) {
    throw new ValidationError('webhook timeout_ms must be 1..30000');
  }
  const timeoutMs = config.timeout_ms;
  if (typeof fetchImpl !== 'function' || !(state instanceof Map)) {
    throw new ValidationError('webhook sender requires fetch function and in-memory Map');
  }

  async function dispatch(command, signal) {
    if (signal?.aborted) return attemptReceipt(command, 'cancelled_before_dispatch');

    const controller = new AbortController();
    let abort;
    const interrupted = new Promise((_resolve, reject) => {
      abort = () => {
        controller.abort();
        reject(new Error('webhook attempt interrupted'));
      };
    });
    const timer = setTimeout(abort, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      if (signal?.aborted) return attemptReceipt(command, 'cancelled_before_dispatch');
      const body = canonicalJson({
        account_id: accountId,
        recipient_id: recipientId,
        text: command.body
      });
      const response = await Promise.race([
        (async () => {
          const result = await fetchImpl(destination, {
            method: 'POST',
            redirect: 'error',
            headers: {
              authorization: `Bearer ${credential}`,
              'content-type': 'application/json',
              'idempotency-key': command.idempotency_key
            },
            body,
            signal: controller.signal
          });
          if (!(result instanceof Response)) {
            throw new ValidationError('webhook transport did not return a Response');
          }
          await discardBoundedResponse(result);
          return result;
        })(),
        interrupted
      ]);
      const status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
        ? response.status
        : null;
      return attemptReceipt(
        command,
        status !== null && status >= 200 && status < 300 ? 'accepted_by_endpoint' : 'uncertain',
        status
      );
    } catch {
      // Failure or timeout after dispatch cannot prove the endpoint did not act.
      return attemptReceipt(command, 'uncertain');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  return Object.freeze({
    async send(rawCommand, { signal } = {}) {
      const command = exactFields(rawCommand, [
        'account_id', 'recipient_id', 'confirmed_recipient_id', 'body', 'idempotency_key'
      ], 'webhook send command');
      if (command.account_id !== accountId || command.recipient_id !== recipientId ||
          command.confirmed_recipient_id !== recipientId) {
        throw new ValidationError('webhook account or recipient does not match the fixed destination');
      }
      if (signal !== undefined && !(signal instanceof AbortSignal)) {
        throw new ValidationError('webhook signal must be an AbortSignal');
      }
      const message = assertString(command.body, 'webhook body', { max: MAX_MESSAGE_BYTES });
      if (Buffer.byteLength(message, 'utf8') > MAX_MESSAGE_BYTES) {
        throw new ValidationError('webhook body exceeds byte limit');
      }
      const key = assertString(command.idempotency_key, 'webhook idempotency_key', {
        max: 160, pattern: IDEMPOTENCY_KEY
      });
      const normalized = { account_id: accountId, recipient_id: recipientId, body: message, idempotency_key: key };
      const fingerprint = digestObject({ destination, ...normalized });
      const prior = Map.prototype.get.call(state, key);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new ValidationError('webhook idempotency conflict');
        return prior.promise;
      }
      if (signal?.aborted) return attemptReceipt(normalized, 'cancelled_before_dispatch');
      if (MAP_SIZE_GETTER.call(state) >= MAX_IDEMPOTENCY_ENTRIES) {
        throw new ValidationError('webhook idempotency state capacity exhausted');
      }
      let resolveAttempt;
      let rejectAttempt;
      const promise = new Promise((resolve, reject) => {
        resolveAttempt = resolve;
        rejectAttempt = reject;
      });
      const entry = { fingerprint, promise };
      // A transport must not be scheduled until the reservation is observed in
      // the Map's actual storage, even when a Map subclass overrides set().
      try {
        state.set(key, entry);
        if (Map.prototype.get.call(state, key) !== entry) {
          throw new ValidationError('webhook idempotency reservation was not stored');
        }
      } catch {
        if (Map.prototype.get.call(state, key) === entry) Map.prototype.delete.call(state, key);
        throw new ValidationError('webhook idempotency state unavailable');
      }
      void promise.then(receipt => {
        if (receipt.state === 'cancelled_before_dispatch' && Map.prototype.get.call(state, key) === entry) {
          Map.prototype.delete.call(state, key);
        }
      }, () => {
        if (Map.prototype.get.call(state, key) === entry) Map.prototype.delete.call(state, key);
      });
      void Promise.resolve().then(() => dispatch(normalized, signal)).then(resolveAttempt, rejectAttempt);
      return promise;
    }
  });
}
