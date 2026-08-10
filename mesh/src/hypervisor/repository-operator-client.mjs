import net from 'node:net';
import { isAbsolute } from 'node:path';
import { AxiomError, ValidationError, assertPlainObject } from '../lib/canonical.mjs';
import { verifyRepositoryDocsEffectReceipt } from '../lib/repository-docs-effect.mjs';
import {
  REPOSITORY_OPERATOR_REQUEST_SCHEMA,
  REPOSITORY_OPERATOR_RESPONSE_SCHEMA
} from '../repository-operator/service.mjs';

const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;
const MAX_SOCKET_BYTES = 100;
const DEFAULT_TIMEOUT_MS = 50_000;

function validateSocketPath(socketPath) {
  if (
    typeof socketPath !== 'string'
    || !isAbsolute(socketPath)
    || Buffer.byteLength(socketPath) > MAX_SOCKET_BYTES
  ) {
    throw new ValidationError('Repository operator client socket must be an absolute path of at most 100 bytes');
  }
  return socketPath;
}

function parseSingleResponse(buffer) {
  const newline = buffer.indexOf(0x0a);
  if (newline === -1) return null;
  const first = buffer.subarray(0, newline).toString('utf8');
  const trailing = buffer.subarray(newline + 1).toString('utf8');
  if (trailing.trim().length) throw new ValidationError('Repository operator returned multiple transport messages');
  let decoded;
  try {
    decoded = JSON.parse(first);
  } catch {
    throw new ValidationError('Repository operator response is not valid JSON');
  }
  const response = assertPlainObject(decoded, 'repository operator response');
  const unknown = Object.keys(response).filter(key => !['schema', 'receipt', 'error'].includes(key));
  if (unknown.length) throw new ValidationError('Repository operator response contains unsupported fields');
  if (response.schema !== REPOSITORY_OPERATOR_RESPONSE_SCHEMA) {
    throw new ValidationError(`Repository operator response schema must be ${REPOSITORY_OPERATOR_RESPONSE_SCHEMA}`);
  }
  if (response.receipt && response.error) throw new ValidationError('Repository operator response cannot contain both receipt and error');
  if (!response.receipt && !response.error) throw new ValidationError('Repository operator response must contain receipt or error');
  return response;
}

export async function invokeRepositoryOperator({
  socketPath,
  prepared_effect,
  grid_prepared_event,
  hypervisorPublicKey,
  operatorPublicKey,
  now = new Date().toISOString(),
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const path = validateSocketPath(socketPath);
  const request = {
    schema: REPOSITORY_OPERATOR_REQUEST_SCHEMA,
    prepared_effect: assertPlainObject(prepared_effect, 'prepared_effect'),
    grid_prepared_event: assertPlainObject(grid_prepared_event, 'grid_prepared_event')
  };
  const serialized = `${JSON.stringify(request)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_MESSAGE_BYTES) {
    throw new ValidationError('Repository operator request exceeds transport ceiling');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new ValidationError('Repository operator client timeout is invalid');
  }

  const response = await new Promise((resolve, reject) => {
    const socket = net.createConnection({ path });
    let buffer = Buffer.alloc(0);
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      callback(value);
    };
    socket.setTimeout(timeoutMs, () => {
      finish(reject, new AxiomError(
        'repository_operator_transport_timeout',
        'Repository operator transport timed out',
        503
      ));
    });
    socket.once('connect', () => socket.write(serialized));
    socket.on('data', chunk => {
      if (settled) return;
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_MESSAGE_BYTES) {
        finish(reject, new ValidationError('Repository operator response exceeds transport ceiling'));
        return;
      }
      let parsed;
      try { parsed = parseSingleResponse(buffer); }
      catch (error) { finish(reject, error); return; }
      if (parsed) finish(resolve, parsed);
    });
    socket.once('error', () => {
      finish(reject, new AxiomError(
        'repository_operator_unavailable',
        'Repository operator transport is unavailable',
        503
      ));
    });
    socket.once('end', () => {
      if (!settled) finish(reject, new AxiomError(
        'repository_operator_response_incomplete',
        'Repository operator closed before returning a complete response',
        503
      ));
    });
  });

  if (response.error) {
    const error = assertPlainObject(response.error, 'repository operator error');
    const code = typeof error.code === 'string' && error.code.length <= 96
      ? error.code
      : 'repository_operator_failed';
    const message = typeof error.message === 'string' && error.message.length <= 240
      ? error.message
      : 'Repository operator failed';
    throw new AxiomError(code, message, code === 'repository_operator_busy' ? 409 : 503);
  }

  return verifyRepositoryDocsEffectReceipt(response.receipt, {
    prepared_effect,
    hypervisorPublicKey,
    operatorPublicKey,
    now
  });
}
