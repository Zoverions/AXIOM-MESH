import { lstat, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ValidationError,
  assertPlainObject,
  assertString
} from './lib/canonical.mjs';
import { openPublicWitnessCurrentnessAnchorStore } from './lib/public-witness-currentness-anchor-store.mjs';
import { openPublicWitnessDurableStore } from './lib/public-witness-durable-store.mjs';

export const PUBLIC_WITNESS_PROCESS_CONFIG_SCHEMA = 'axiom-public-witness-process-config.v1';
export const PUBLIC_WITNESS_PROCESS_REQUEST_SCHEMA = 'axiom-public-witness-process-request.v1';
export const PUBLIC_WITNESS_PROCESS_RESPONSE_SCHEMA = 'axiom-public-witness-process-response.v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const DEFAULT_MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const HARD_MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const MAX_CONFIG_FILE_BYTES = 64 * 1024;
const MAX_WITNESS_KEY_FILE_BYTES = 64 * 1024;
const CURRENTNESS_ANCHOR_STATE_SUFFIX = '.currentness-anchors.jsonl';
const OPERATIONS = new Set([
  'observe-credential',
  'observe-revocation',
  'observe-journal',
  'get-artifact',
  'get-observation',
  'list-position',
  'list-conflicts',
  'snapshot',
  'verify-state',
  'publish-currentness-anchor',
  'get-currentness-anchor',
  'get-currentness-anchor-head'
]);

function exactKeys(raw, expected, label) {
  const value = assertPlainObject(raw, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.join(',') !== wanted.join(',')) {
    throw new ValidationError(`${label} fields are invalid`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function optionalPositiveInteger(value, label) {
  if (value === null) return undefined;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive safe integer or null`);
  }
  return value;
}

function boundedInteger(value, label, fallback, max) {
  const normalized = value === null ? fallback : value;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > max) {
    throw new ValidationError(`${label} must be a positive safe integer no greater than ${max}`);
  }
  return normalized;
}

async function readBoundedRegularTextFile(path, label, maxBytes) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new ValidationError(`${label} must be a regular non-symlink file`);
  }
  if (info.size > maxBytes) {
    throw new ValidationError(`${label} exceeds configured byte limit`);
  }
  const text = await readFile(path, 'utf8');
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new ValidationError(`${label} exceeds configured byte limit`);
  }
  return text;
}

export function normalizePublicWitnessProcessConfig(raw, configPath = '.') {
  const value = exactKeys(raw, [
    'schema',
    'domain_id',
    'witness_id',
    'witness_private_key_path',
    'state_path',
    'max_artifacts',
    'max_conflicts',
    'max_state_bytes',
    'max_record_bytes',
    'max_request_bytes'
  ], 'public witness process config');
  if (value.schema !== PUBLIC_WITNESS_PROCESS_CONFIG_SCHEMA) {
    throw new ValidationError('public witness process config schema is unsupported');
  }
  const base = dirname(resolve(configPath));
  const privateKeyPath = resolve(base, assertString(value.witness_private_key_path, 'witness_private_key_path', { min: 1, max: 4096 }));
  const statePath = resolve(base, assertString(value.state_path, 'state_path', { min: 1, max: 4096 }));
  if (privateKeyPath === statePath) {
    throw new ValidationError('public witness key path and state path must be distinct');
  }
  return Object.freeze({
    schema: PUBLIC_WITNESS_PROCESS_CONFIG_SCHEMA,
    domain_id: identifier(value.domain_id, 'domain_id'),
    witness_id: identifier(value.witness_id, 'witness_id'),
    witness_private_key_path: privateKeyPath,
    state_path: statePath,
    max_artifacts: optionalPositiveInteger(value.max_artifacts, 'max_artifacts'),
    max_conflicts: optionalPositiveInteger(value.max_conflicts, 'max_conflicts'),
    max_state_bytes: optionalPositiveInteger(value.max_state_bytes, 'max_state_bytes'),
    max_record_bytes: optionalPositiveInteger(value.max_record_bytes, 'max_record_bytes'),
    max_request_bytes: boundedInteger(value.max_request_bytes, 'max_request_bytes', DEFAULT_MAX_REQUEST_BYTES, HARD_MAX_REQUEST_BYTES)
  });
}

export async function loadPublicWitnessProcessRuntime(configPath) {
  const path = resolve(assertString(configPath, 'public witness config path', { min: 1, max: 4096 }));
  let parsed;
  try {
    parsed = JSON.parse(await readBoundedRegularTextFile(
      path,
      'public witness process config file',
      MAX_CONFIG_FILE_BYTES
    ));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ValidationError('public witness process config is not valid JSON');
    }
    throw error;
  }
  const config = normalizePublicWitnessProcessConfig(parsed, path);
  const witnessPrivateKey = await readBoundedRegularTextFile(
    config.witness_private_key_path,
    'public witness private key file',
    MAX_WITNESS_KEY_FILE_BYTES
  );
  const store = await openPublicWitnessDurableStore({
    statePath: config.state_path,
    domainId: config.domain_id,
    witnessId: config.witness_id,
    witnessPrivateKey,
    maxArtifacts: config.max_artifacts,
    maxConflicts: config.max_conflicts,
    maxStateBytes: config.max_state_bytes,
    maxRecordBytes: config.max_record_bytes
  });
  const currentnessAnchorStatePath = `${config.state_path}${CURRENTNESS_ANCHOR_STATE_SUFFIX}`;
  if (currentnessAnchorStatePath === config.witness_private_key_path) {
    throw new ValidationError('public witness currentness anchor state path must be distinct from witness key path');
  }
  const currentnessAnchorStore = await openPublicWitnessCurrentnessAnchorStore({
    statePath: currentnessAnchorStatePath,
    domainId: config.domain_id,
    witnessId: config.witness_id,
    witnessPrivateKey,
    maxStateBytes: config.max_state_bytes,
    maxRecordBytes: config.max_record_bytes
  });
  return Object.freeze({ config, store, currentnessAnchorStore });
}

function normalizeRequest(raw) {
  const value = exactKeys(raw, ['schema', 'request_id', 'operation', 'payload'], 'public witness process request');
  if (value.schema !== PUBLIC_WITNESS_PROCESS_REQUEST_SCHEMA) {
    throw new ValidationError('public witness process request schema is unsupported');
  }
  const operation = assertString(value.operation, 'public witness process operation');
  if (!OPERATIONS.has(operation)) {
    throw new ValidationError('public witness process operation is unsupported');
  }
  if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) {
    throw new ValidationError('public witness process payload must be an object');
  }
  return Object.freeze({
    schema: PUBLIC_WITNESS_PROCESS_REQUEST_SCHEMA,
    request_id: identifier(value.request_id, 'public witness process request_id'),
    operation,
    payload: value.payload
  });
}

function response(requestId, ok, body) {
  return Object.freeze({
    schema: PUBLIC_WITNESS_PROCESS_RESPONSE_SCHEMA,
    request_id: requestId,
    ok,
    ...(ok ? { result: body } : { error: body })
  });
}

function normalizeObservePayload(operation, payload) {
  if (operation === 'observe-credential') {
    const value = exactKeys(payload, [
      'credential',
      'trusted_persona_root_public_key',
      'observed_at'
    ], 'public witness process credential payload');
    return {
      credential: value.credential,
      trusted_persona_root_public_key: value.trusted_persona_root_public_key,
      observed_at: value.observed_at
    };
  }
  if (operation === 'observe-revocation') {
    const value = exactKeys(payload, [
      'revocation',
      'credential',
      'trusted_persona_root_public_key',
      'observed_at'
    ], 'public witness process revocation payload');
    return {
      revocation: value.revocation,
      credential: value.credential,
      trusted_persona_root_public_key: value.trusted_persona_root_public_key,
      observed_at: value.observed_at
    };
  }
  if (operation === 'observe-journal') {
    const value = exactKeys(payload, [
      'attestation',
      'persona_signing_credential',
      'trusted_persona_root_public_key',
      'entry',
      'publication',
      'observed_at'
    ], 'public witness process journal payload');
    return {
      attestation: value.attestation,
      persona_signing_credential: value.persona_signing_credential,
      trusted_persona_root_public_key: value.trusted_persona_root_public_key,
      entry: value.entry,
      publication: value.publication,
      observed_at: value.observed_at
    };
  }
  throw new ValidationError('public witness process observation operation is unsupported');
}

export async function handlePublicWitnessProcessRequest(runtime, raw) {
  const request = normalizeRequest(raw);
  try {
    let result;
    if (request.operation.startsWith('observe-')) {
      result = await runtime.store.commit(
        request.operation,
        normalizeObservePayload(request.operation, request.payload)
      );
    } else if (request.operation === 'publish-currentness-anchor') {
      const payload = exactKeys(request.payload, [
        'anchor',
        'anchored_checkpoint',
        'trusted_controller_public_key',
        'published_at'
      ], 'public witness process publish-currentness-anchor payload');
      result = await runtime.currentnessAnchorStore.publish({
        anchor: payload.anchor,
        anchoredCheckpoint: payload.anchored_checkpoint,
        trustedControllerPublicKey: payload.trusted_controller_public_key,
        publishedAt: payload.published_at
      });
    } else if (request.operation === 'get-currentness-anchor') {
      const payload = exactKeys(
        request.payload,
        ['anchor_digest'],
        'public witness process get-currentness-anchor payload'
      );
      result = runtime.currentnessAnchorStore.getAnchor(
        digest(payload.anchor_digest, 'anchor_digest')
      );
    } else if (request.operation === 'get-currentness-anchor-head') {
      const payload = exactKeys(request.payload, [
        'root_binding_digest',
        'root_authority_digest',
        'root_holder',
        'controller_key_id'
      ], 'public witness process get-currentness-anchor-head payload');
      result = runtime.currentnessAnchorStore.getHead({
        rootBindingDigest: digest(payload.root_binding_digest, 'root_binding_digest'),
        rootAuthorityDigest: digest(payload.root_authority_digest, 'root_authority_digest'),
        rootHolder: identifier(payload.root_holder, 'root_holder'),
        controllerKeyId: digest(payload.controller_key_id, 'controller_key_id')
      });
    } else if (request.operation === 'get-artifact') {
      const payload = exactKeys(request.payload, ['artifact_digest'], 'public witness process get-artifact payload');
      result = runtime.store.getArtifact(digest(payload.artifact_digest, 'artifact_digest'));
    } else if (request.operation === 'get-observation') {
      const payload = exactKeys(request.payload, ['artifact_digest'], 'public witness process get-observation payload');
      result = runtime.store.getObservation(digest(payload.artifact_digest, 'artifact_digest'));
    } else if (request.operation === 'list-position') {
      const payload = exactKeys(request.payload, [
        'position_kind',
        'persona_id',
        'persona_projection_digest',
        'persona_root_key_id',
        'position'
      ], 'public witness process list-position payload');
      result = runtime.store.listPosition({
        positionKind: payload.position_kind,
        personaId: payload.persona_id,
        personaProjectionDigest: payload.persona_projection_digest,
        personaRootKeyId: payload.persona_root_key_id,
        position: payload.position
      });
    } else if (request.operation === 'list-conflicts') {
      exactKeys(request.payload, [], 'public witness process list-conflicts payload');
      result = runtime.store.listConflicts();
    } else if (request.operation === 'snapshot') {
      exactKeys(request.payload, [], 'public witness process snapshot payload');
      result = runtime.store.snapshot();
    } else if (request.operation === 'verify-state') {
      exactKeys(request.payload, [], 'public witness process verify-state payload');
      result = await runtime.store.verifyState();
    } else {
      throw new ValidationError('public witness process operation is unsupported');
    }
    return response(request.request_id, true, result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return response(request.request_id, false, Object.freeze({
        code: error.code,
        message: error.message
      }));
    }
    throw error;
  }
}

async function* boundedLines(input, maxBytes) {
  let pending = Buffer.alloc(0);
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let offset = 0;
    while (offset < bytes.length) {
      const newline = bytes.indexOf(0x0a, offset);
      if (newline === -1) {
        const tail = bytes.subarray(offset);
        if (pending.length + tail.length > maxBytes) {
          throw new ValidationError('public witness process request exceeds configured byte limit');
        }
        if (tail.length > 0) {
          pending = pending.length === 0
            ? Buffer.from(tail)
            : Buffer.concat([pending, tail], pending.length + tail.length);
        }
        break;
      }

      const segment = bytes.subarray(offset, newline);
      if (pending.length + segment.length > maxBytes) {
        throw new ValidationError('public witness process request exceeds configured byte limit');
      }
      const line = pending.length === 0
        ? segment
        : Buffer.concat([pending, segment], pending.length + segment.length);
      pending = Buffer.alloc(0);
      if (line.length > 0) yield line.toString('utf8');
      offset = newline + 1;
    }
  }
  if (pending.length !== 0) {
    throw new ValidationError('public witness process input ended with an incomplete request');
  }
}

export async function runPublicWitnessStdio(runtime, {
  input = process.stdin,
  output = process.stdout
} = {}) {
  for await (const line of boundedLines(input, runtime.config.max_request_bytes)) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      const invalid = response('invalid-request', false, Object.freeze({
        code: 'validation_error',
        message: 'public witness process request is not valid JSON'
      }));
      output.write(`${JSON.stringify(invalid)}\n`);
      continue;
    }
    let handled;
    try {
      handled = await handlePublicWitnessProcessRequest(runtime, parsed);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      const requestId = typeof parsed?.request_id === 'string' && IDENTIFIER.test(parsed.request_id)
        ? parsed.request_id
        : 'invalid-request';
      handled = response(requestId, false, Object.freeze({
        code: error.code,
        message: error.message
      }));
    }
    output.write(`${JSON.stringify(handled)}\n`);
  }
}

export async function runPublicWitnessServiceCommand(argv, io = {}) {
  const [command, configPath] = argv;
  if (!['run', 'verify', 'snapshot'].includes(command) || !configPath || argv.length !== 2) {
    throw new ValidationError('Usage: node src/public-witness-service.mjs <run|verify|snapshot> <config.json>');
  }
  const runtime = await loadPublicWitnessProcessRuntime(configPath);
  if (command === 'run') {
    await runPublicWitnessStdio(runtime, io);
    return runtime.store.snapshot();
  }
  const result = command === 'verify'
    ? await runtime.store.verifyState()
    : runtime.store.snapshot();
  (io.output ?? process.stdout).write(`${JSON.stringify(result)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runPublicWitnessServiceCommand(process.argv.slice(2));
}
