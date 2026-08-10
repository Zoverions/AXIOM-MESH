import http from 'node:http';
import https from 'node:https';
import { once } from 'node:events';
import { AxiomError, ValidationError, newId } from './canonical.mjs';
import { createStructuredLogger } from './logger.mjs';
import { identifyActiveTransportPeer } from './transport-credentials.mjs';

const SECURITY_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
});

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler, options = {}) {
    const keys = [];
    const escaped = pattern
      .split('/')
      .map(part => {
        if (part.startsWith(':')) {
          keys.push(part.slice(1));
          return '([^/]+)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    this.routes.push({
      method: method.toUpperCase(),
      pattern,
      regex: new RegExp(`^${escaped}/?$`),
      keys,
      handler,
      options
    });
    return this;
  }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;
      const match = pathname.match(route.regex);
      if (!match) continue;
      const params = {};
      try {
        route.keys.forEach((key, index) => {
          params[key] = decodeURIComponent(match[index + 1]);
        });
      } catch {
        throw new ValidationError('Route parameter contains invalid percent-encoding');
      }
      return { ...route, params };
    }
    return null;
  }
}

export async function readBody(req, maxBytes) {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AxiomError('body_too_large', 'Request body exceeds the configured limit', 413);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      req.destroy();
      throw new AxiomError('body_too_large', 'Request body exceeds the configured limit', 413);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function parseJsonBody(buffer, { required = true } = {}) {
  if (!buffer.length && !required) return undefined;
  if (!buffer.length) throw new ValidationError('A JSON request body is required');
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new ValidationError('Request body is not valid JSON');
  }
}

export function sendJson(res, status, value, headers = {}) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    ...headers
  });
  res.end(body);
}

export function sendBuffer(res, status, body, contentType, headers = {}) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'content-type': contentType,
    'content-length': String(body.length),
    ...headers
  });
  res.end(body);
}

export function errorResponse(error, traceId) {
  const known = error instanceof AxiomError || error instanceof ValidationError;
  const status = known ? error.status ?? 400 : 500;
  return {
    status,
    body: {
      error: {
        code: known ? error.code ?? 'validation_error' : 'internal_error',
        message: known ? error.message : 'The request could not be completed',
        ...(known && error.details !== undefined ? { details: error.details } : {})
      },
      trace_id: traceId
    }
  };
}

export function createServiceServer({
  name,
  router,
  maxBodyBytes = 1_048_576,
  context = {},
  authenticate,
  admitRequest,
  onError,
  telemetry,
  tls,
  transportPeers,
  allowedTransportPeers,
  authorizeRequest
}) {
  const logger = createStructuredLogger(name);
  const requestAdmission = admitRequest ?? authenticate?.admitRequest;
  const handleRequest = async (req, res) => {
    const started = performance.now();
    const traceId = validTraceId(req.headers['x-trace-id']) ? req.headers['x-trace-id'] : newId('trace');
    let requestError;
    let releaseAdmission;
    telemetry?.beginRequest();
    res.setHeader('x-trace-id', traceId);
    try {
      let transportPeer;
      if (tls) {
        try {
          transportPeer = identifyActiveTransportPeer(
            req.socket,
            transportPeers,
            allowedTransportPeers
          );
        } catch {
          throw new AxiomError(
            'invalid_transport_peer',
            'An active allowed transport peer is required',
            401
          );
        }
      }
      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
      const route = router.match(req.method, url.pathname);
      if (!route) throw new AxiomError('not_found', 'Route not found', 404);
      if (transportPeer && authorizeRequest) {
        await authorizeRequest({
          req,
          url,
          route,
          traceId,
          transportPeer
        });
      }
      const body = ['GET', 'HEAD'].includes(req.method) ? Buffer.alloc(0) : await readBody(req, maxBodyBytes);
      let principal;
      if (route.options.auth !== false && authenticate) {
        principal = await authenticate({ req, body, traceId, route, url });
      }
      if (!transportPeer && principal && authorizeRequest) {
        await authorizeRequest({
          req,
          url,
          route,
          traceId,
          principal
        });
      }
      if (principal && requestAdmission) {
        const release = await requestAdmission({
          req,
          body,
          url,
          route,
          traceId,
          principal
        });
        if (release !== undefined && typeof release !== 'function') {
          throw new ValidationError('Request admission hook must return a release function or undefined');
        }
        releaseAdmission = release;
      }
      const result = await route.handler({
        req,
        res,
        body,
        url,
        params: route.params,
        traceId,
        principal,
        context
      });
      if (res.writableEnded) return;
      if (!result) {
        sendJson(res, 204, null);
      } else if (result.buffer) {
        sendBuffer(
          res,
          result.httpStatus ?? 200,
          result.buffer,
          result.contentType ?? 'application/octet-stream',
          result.headers
        );
      } else if (Number.isInteger(result.httpStatus)) {
        sendJson(res, result.httpStatus, result.body, result.headers);
      } else {
        sendJson(res, 200, result);
      }
    } catch (error) {
      requestError = error;
      if (!(error instanceof AxiomError) && !(error instanceof ValidationError)) {
        const diagnostic = {
          event: 'request.error',
          trace_id: traceId,
          error
        };
        if (onError) onError(diagnostic);
        else logger.error(diagnostic);
      }
      if (!res.writableEnded) {
        const response = errorResponse(error, traceId);
        sendJson(res, response.status, response.body);
      }
    } finally {
      if (releaseAdmission) {
        try {
          releaseAdmission();
        } catch (error) {
          logger.error({
            event: 'request.admission_release_failed',
            trace_id: traceId,
            error
          });
        }
      }
      const elapsed = Math.round((performance.now() - started) * 100) / 100;
      telemetry?.finishRequest({
        status: res.statusCode,
        elapsedMs: elapsed,
        errorCode: requestError?.code
      });
      if (process.env.AXIOM_LOG_REQUESTS === 'true') {
        let path = '/';
        try {
          path = new URL(req.url, 'http://localhost').pathname;
        } catch {
          path = '[INVALID]';
        }
        logger.info({
          event: 'request.completed',
          trace_id: traceId,
          method: req.method,
          path,
          status: res.statusCode,
          ms: elapsed
        });
      }
    }
  };
  const server = tls
    ? https.createServer(tls, handleRequest)
    : http.createServer(handleRequest);
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 1_000;
  return server;
}

export async function listen(server, { host, port }) {
  server.listen(port, host);
  await once(server, 'listening');
  return server.address();
}

export async function close(server) {
  if (!server?.listening) return;
  server.close();
  await once(server, 'close');
}

function validTraceId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{8,160}$/.test(value);
}

export class TokenBucketLimiter {
  constructor({ capacity = 60, refillPerSecond = 1, maxKeys = 10_000 } = {}) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.maxKeys = maxKeys;
    this.buckets = new Map();
  }

  take(key, now = Date.now()) {
    const previous = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    const elapsed = Math.max(0, (now - previous.at) / 1000);
    const available = Math.min(this.capacity, previous.tokens + elapsed * this.refillPerSecond);
    if (available < 1) {
      this.buckets.set(key, { tokens: available, at: now });
      return false;
    }
    this.buckets.delete(key);
    this.buckets.set(key, { tokens: available - 1, at: now });
    while (this.buckets.size > this.maxKeys) this.buckets.delete(this.buckets.keys().next().value);
    return true;
  }
}
