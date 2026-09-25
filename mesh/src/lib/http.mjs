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

const DIRECT_RESPONSE_METHODS = new Set([
  'write',
  'end',
  'writeHead',
  'flushHeaders',
  'writeContinue',
  'writeEarlyHints',
  'writeProcessing'
]);

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

export async function readBody(req, maxBytes, { limitError } = {}) {
  const tooLarge = requestBytes => {
    if (limitError) {
      return new AxiomError(
        limitError.code,
        limitError.message,
        limitError.status,
        {
          ...(limitError.details ?? {}),
          request_bytes: requestBytes
        }
      );
    }
    return new AxiomError('body_too_large', 'Request body exceeds the configured limit', 413);
  };
  const declared = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw tooLarge(declared);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      req.destroy();
      throw tooLarge(size);
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
  writeResponseBuffer(res, status, body, 'application/json; charset=utf-8', headers);
}

export function sendBuffer(res, status, body, contentType, headers = {}) {
  writeResponseBuffer(res, status, body, contentType, headers);
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
  inspectResponse,
  onError,
  telemetry,
  tls,
  transportPeers,
  allowedTransportPeers,
  authorizeRequest
}) {
  const logger = createStructuredLogger(name);
  const requestAdmission = admitRequest ?? authenticate?.admitRequest;
  const requestBodyLimit = authenticate?.resolveBodyLimit ?? requestAdmission?.resolveBodyLimit;
  const responseInspection = inspectResponse ?? authenticate?.inspectResponse;
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
      let url;
      try {
        url = new URL(req.url, 'http://127.0.0.1');
      } catch {
        throw new ValidationError('Request target is invalid');
      }
      if (url.origin !== 'http://127.0.0.1') {
        throw new ValidationError('Request target must use origin-form addressing');
      }
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
      let bodyLimit = { maxBytes: maxBodyBytes };
      if (
        !['GET', 'HEAD'].includes(req.method)
        && route.options.auth !== false
        && requestBodyLimit
      ) {
        bodyLimit = normalizeBodyLimitResolution(await requestBodyLimit({
          req,
          url,
          route,
          traceId,
          maxBodyBytes
        }), maxBodyBytes);
      }
      const body = ['GET', 'HEAD'].includes(req.method)
        ? Buffer.alloc(0)
        : await readBody(req, bodyLimit.maxBytes, { limitError: bodyLimit.limitError });
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
      const boundedResponse = principal && responseInspection
        ? responseInspection.requiresPreflight?.({
            req,
            body,
            url,
            route,
            traceId,
            principal
          }) !== false
        : false;
      const routeResponse = boundedResponse
        ? directWriteRejectingResponse(res)
        : res;
      const result = await route.handler({
        req,
        res: routeResponse,
        body,
        url,
        params: route.params,
        traceId,
        principal,
        context
      });
      if (res.writableEnded) return;
      if (!result) {
        await sendApplicationJson(res, 204, null, undefined, {
          boundedResponse,
          responseInspection,
          req,
          url,
          route,
          traceId,
          principal
        });
      } else if (result.buffer) {
        await sendApplicationBuffer(
          res,
          result.httpStatus ?? 200,
          result.buffer,
          result.contentType ?? 'application/octet-stream',
          result.headers,
          {
            boundedResponse,
            responseInspection,
            req,
            url,
            route,
            traceId,
            principal
          }
        );
      } else if (Number.isInteger(result.httpStatus)) {
        await sendApplicationJson(res, result.httpStatus, result.body, result.headers, {
          boundedResponse,
          responseInspection,
          req,
          url,
          route,
          traceId,
          principal
        });
      } else {
        await sendApplicationJson(res, 200, result, undefined, {
          boundedResponse,
          responseInspection,
          req,
          url,
          route,
          traceId,
          principal
        });
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
        // Control/error responses bypass application response budgets so a
        // bounded machine caller can always receive the reason it was denied.
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

function normalizeBodyLimitResolution(value, globalMaximum) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Request body-limit resolver must return an object');
  }
  const maxBytes = value.maxBytes;
  if (
    !Number.isSafeInteger(maxBytes)
    || maxBytes < 1
    || maxBytes > globalMaximum
  ) {
    throw new ValidationError('Request body-limit resolver cannot exceed the configured global limit');
  }
  let limitError;
  if (value.limitError !== undefined) {
    if (!value.limitError || typeof value.limitError !== 'object' || Array.isArray(value.limitError)) {
      throw new ValidationError('Request body-limit error contract is invalid');
    }
    const { code, message, status, details } = value.limitError;
    if (
      typeof code !== 'string'
      || !code.length
      || typeof message !== 'string'
      || !message.length
      || !Number.isSafeInteger(status)
      || status < 400
      || status > 599
      || (details !== undefined && (!details || typeof details !== 'object' || Array.isArray(details)))
    ) {
      throw new ValidationError('Request body-limit error contract is invalid');
    }
    limitError = {
      code,
      message,
      status,
      ...(details === undefined ? {} : { details: structuredClone(details) })
    };
  }
  return { maxBytes, ...(limitError ? { limitError } : {}) };
}

async function sendApplicationJson(res, status, value, headers, context) {
  const body = Buffer.from(JSON.stringify(value));
  await inspectApplicationResponse(body, context);
  writeResponseBuffer(res, status, body, 'application/json; charset=utf-8', headers);
}

async function sendApplicationBuffer(res, status, body, contentType, headers, context) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  await inspectApplicationResponse(payload, context);
  writeResponseBuffer(res, status, payload, contentType, headers);
}

async function inspectApplicationResponse(body, {
  boundedResponse,
  responseInspection,
  req,
  url,
  route,
  traceId,
  principal
}) {
  if (!boundedResponse || !responseInspection) return;
  await responseInspection({
    req,
    url,
    route,
    traceId,
    principal,
    responseBytes: body.length
  });
}

function writeResponseBuffer(res, status, body, contentType, headers = {}) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'content-type': contentType,
    'content-length': String(body.length),
    ...headers
  });
  res.end(body);
}

function directWriteRejectingResponse(res) {
  return new Proxy(res, {
    get(target, property) {
      if (DIRECT_RESPONSE_METHODS.has(property)) {
        return () => {
          throw new AxiomError(
            'machine_direct_response_unavailable',
            'Constrained machine responses must return through the bounded response path',
            500
          );
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, property, value) {
      return Reflect.set(target, property, value, target);
    }
  });
}

// Token buckets keyed by caller. A bucket is evicted only once it has fully
// refilled, when it is indistinguishable from a new one, so eviction never
// grants extra allowance; with every bucket still refilling, a new key is
// refused (fail closed). Buckets are ordered by the time they will be full
// again in a min-heap, so finding an evictable bucket costs O(log n) instead
// of a scan of every key (scalability audit S-08). Heap entries for buckets
// that have since been used again are skipped lazily, and the heap is rebuilt
// once stale entries outnumber live ones.
export class TokenBucketLimiter {
  constructor({ capacity = 60, refillPerSecond = 1, maxKeys = 10_000 } = {}) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.maxKeys = maxKeys;
    this.buckets = new Map();
    this.fullHeap = [];
  }

  take(key, now = Date.now()) {
    let previous = this.buckets.get(key);
    if (!previous) {
      if (this.buckets.size >= this.maxKeys && !this.evictRefilledBucket(now)) {
        return false;
      }
      previous = { tokens: this.capacity, at: now };
    }
    const elapsed = Math.max(0, (now - previous.at) / 1000);
    const available = Math.min(this.capacity, previous.tokens + elapsed * this.refillPerSecond);
    const admitted = available >= 1;
    this.setBucket(key, admitted ? available - 1 : available, now);
    return admitted;
  }

  setBucket(key, tokens, at) {
    const fullAt = tokens >= this.capacity
      ? at
      : this.refillPerSecond > 0
        ? at + ((this.capacity - tokens) / this.refillPerSecond) * 1000
        : Infinity;
    const bucket = { tokens, at, fullAt };
    this.buckets.set(key, bucket);
    heapPush(this.fullHeap, { fullAt, key, bucket });
    if (this.fullHeap.length > 2 * this.buckets.size + 64) this.rebuildHeap();
  }

  evictRefilledBucket(now) {
    const heap = this.fullHeap;
    while (heap.length) {
      const top = heap[0];
      if (this.buckets.get(top.key) !== top.bucket) {
        heapPop(heap);
        continue;
      }
      const elapsed = Math.max(0, (now - top.bucket.at) / 1000);
      const available = Math.min(this.capacity, top.bucket.tokens + elapsed * this.refillPerSecond);
      if (available < this.capacity) return false;
      heapPop(heap);
      this.buckets.delete(top.key);
      return true;
    }
    return false;
  }

  rebuildHeap() {
    this.fullHeap = [];
    for (const [key, bucket] of this.buckets) {
      heapPush(this.fullHeap, { fullAt: bucket.fullAt, key, bucket });
    }
  }
}

function heapPush(heap, entry) {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (heap[parent].fullAt <= entry.fullAt) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = entry;
}

function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      if (left >= heap.length) break;
      const right = left + 1;
      const child = right < heap.length && heap[right].fullAt < heap[left].fullAt ? right : left;
      if (heap[child].fullAt >= last.fullAt) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = last;
  }
  return top;
}
