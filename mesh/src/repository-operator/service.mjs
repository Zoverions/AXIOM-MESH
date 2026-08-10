import net from 'node:net';
import { chmod, lstat, unlink } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { ValidationError, assertPlainObject } from '../lib/canonical.mjs';

export const REPOSITORY_OPERATOR_SERVICE_SCHEMA = 'axiom-repository-operator-service.v1';
export const REPOSITORY_OPERATOR_REQUEST_SCHEMA = 'axiom-repository-operator-request.v1';
export const REPOSITORY_OPERATOR_RESPONSE_SCHEMA = 'axiom-repository-operator-response.v1';

const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;
const MAX_SOCKET_BYTES = 100;
const DEFAULT_TIMEOUT_MS = 45_000;

function validateSocketPath(socketPath) {
  if (
    typeof socketPath !== 'string'
    || !isAbsolute(socketPath)
    || Buffer.byteLength(socketPath) > MAX_SOCKET_BYTES
  ) {
    throw new ValidationError('Repository operator socket must be an absolute path of at most 100 bytes');
  }
  return socketPath;
}

function sanitizeError(error) {
  const code = typeof error?.code === 'string' && error.code.length <= 96
    ? error.code
    : 'repository_operator_failed';
  const message = typeof error?.message === 'string' && error.message.length <= 240
    ? error.message
    : 'Repository operator failed';
  return { code, message };
}

function normalizeRequest(raw) {
  const value = assertPlainObject(raw, 'repository operator service request');
  const unknown = Object.keys(value).filter(key => ![
    'schema',
    'prepared_effect',
    'grid_prepared_event'
  ].includes(key));
  if (unknown.length) {
    throw new ValidationError(`Repository operator request contains unsupported fields: ${unknown.join(', ')}`);
  }
  if (value.schema !== REPOSITORY_OPERATOR_REQUEST_SCHEMA) {
    throw new ValidationError(`Repository operator request schema must be ${REPOSITORY_OPERATOR_REQUEST_SCHEMA}`);
  }
  return {
    schema: REPOSITORY_OPERATOR_REQUEST_SCHEMA,
    prepared_effect: assertPlainObject(value.prepared_effect, 'prepared_effect'),
    grid_prepared_event: assertPlainObject(value.grid_prepared_event, 'grid_prepared_event')
  };
}

function encodeResponse(value) {
  const serialized = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_MESSAGE_BYTES) {
    return `${JSON.stringify({
      schema: REPOSITORY_OPERATOR_RESPONSE_SCHEMA,
      error: {
        code: 'repository_operator_response_too_large',
        message: 'Repository operator response exceeded the transport ceiling'
      }
    })}\n`;
  }
  return serialized;
}

async function removeStaleSocket(socketPath) {
  let metadata;
  try {
    metadata = await lstat(socketPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (!metadata.isSocket()) {
    throw new ValidationError('Repository operator socket path exists and is not a Unix-domain socket');
  }
  await unlink(socketPath);
}

async function unlinkIfPresent(socketPath) {
  try {
    await unlink(socketPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function closeServer(server, connections) {
  for (const connection of connections) connection.destroy();
  if (!server.listening) return;
  await new Promise(resolve => server.close(resolve));
}

function writeAndClose(socket, payload) {
  if (socket.destroyed) return;
  socket.end(encodeResponse(payload));
}

function parseSingleMessage(buffer) {
  const newline = buffer.indexOf(0x0a);
  if (newline === -1) return { complete: false };
  const first = buffer.subarray(0, newline).toString('utf8');
  const trailing = buffer.subarray(newline + 1).toString('utf8');
  if (trailing.trim().length) {
    throw new ValidationError('Repository operator transport accepts exactly one request per connection');
  }
  if (!first.trim()) throw new ValidationError('Repository operator request is empty');
  let decoded;
  try {
    decoded = JSON.parse(first);
  } catch {
    throw new ValidationError('Repository operator request must be valid JSON');
  }
  return { complete: true, request: normalizeRequest(decoded) };
}

export async function startRepositoryOperatorService({
  socketPath,
  runOperator,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  socketMode = 0o600
}) {
  const path = validateSocketPath(socketPath);
  if (typeof runOperator !== 'function') throw new ValidationError('Repository operator service requires runOperator');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new ValidationError('Repository operator service timeout is invalid');
  }
  if (socketMode !== 0o600) throw new ValidationError('Repository operator service socket mode must be 0600');

  await removeStaleSocket(path);
  const connections = new Set();
  let active = false;
  let closed = false;

  const server = net.createServer(socket => {
    connections.add(socket);
    socket.once('close', () => connections.delete(socket));
    socket.setTimeout(timeoutMs, () => {
      writeAndClose(socket, {
        schema: REPOSITORY_OPERATOR_RESPONSE_SCHEMA,
        error: {
          code: 'repository_operator_transport_timeout',
          message: 'Repository operator request timed out'
        }
      });
    });

    if (active) {
      writeAndClose(socket, {
        schema: REPOSITORY_OPERATOR_RESPONSE_SCHEMA,
        error: {
          code: 'repository_operator_busy',
          message: 'Repository operator is processing another external effect'
        }
      });
      return;
    }

    let buffer = Buffer.alloc(0);
    let started = false;
    socket.on('data', chunk => {
      if (started || socket.destroyed) return;
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_MESSAGE_BYTES) {
        started = true;
        writeAndClose(socket, {
          schema: REPOSITORY_OPERATOR_RESPONSE_SCHEMA,
          error: {
            code: 'repository_operator_request_too_large',
            message: 'Repository operator request exceeded the transport ceiling'
          }
        });
        return;
      }
      let parsed;
      try {
        parsed = parseSingleMessage(buffer);
      } catch (error) {
        started = true;
        writeAndClose(socket, {
          schema: REPOSITORY_OPERATOR_RESPONSE_SCHEMA,
          error: sanitizeError(error)
        });
        return;
      }
      if (!parsed.complete) return;
      started = true;
      active = true;
      Promise.resolve(runOperator({
        prepared_effect: parsed.request.prepared_effect,
        grid_prepared_event: parsed.request.grid_prepared_event
      })).then(result => {
        const value = assertPlainObject(result, 'repository operator result');
        const receipt = assertPlainObject(value.receipt, 'repository operator receipt');
        writeAndClose(socket, {
          schema: REPOSITORY_OPERATOR_RESPONSE_SCHEMA,
          receipt
        });
      }).catch(error => {
        writeAndClose(socket, {
          schema: REPOSITORY_OPERATOR_RESPONSE_SCHEMA,
          error: sanitizeError(error)
        });
      }).finally(() => {
        active = false;
      });
    });
    socket.once('error', () => {
      // Transport errors are observed by the caller; no sensitive details are logged here.
    });
  });

  await new Promise((resolve, reject) => {
    const onError = error => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(path);
  });

  try {
    await chmod(path, socketMode);
  } catch (error) {
    await closeServer(server, connections);
    await unlinkIfPresent(path);
    throw error;
  }

  return {
    schema: REPOSITORY_OPERATOR_SERVICE_SCHEMA,
    socket_path: path,
    socket_mode: '0600',
    transport: 'unix-domain-socket',
    async close() {
      if (closed) return;
      closed = true;
      await closeServer(server, connections);
      await unlinkIfPresent(path);
    }
  };
}
