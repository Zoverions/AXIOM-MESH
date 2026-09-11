import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import appPolicy from './app-policy.json' with { type: 'json' };
import gatewayContract from '../../mesh/config/gateway-client-contract.json' with { type: 'json' };
import {
  MACHINE_INTENT_RECEIPT_SCHEMA,
  GRID_CONTINUITY_ANCHOR_SCHEMA,
  EXPORT_PACKAGE_FORMAT,
  verifyMachineReceiptLike,
  verifyContinuityAnchor,
  verifyExportPackage,
  buildVerificationReport
} from '../../packages/axiom-verify/index.mjs';

const APP_ROOT = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(APP_ROOT, '..', '..');
const LOOPBACK_HOST = appPolicy.network.bind_host;
const MAX_REQUEST_BYTES = appPolicy.security.maximum_proxy_request_bytes;
const MAX_RESPONSE_BYTES = appPolicy.security.maximum_proxy_response_bytes;
const PROXY_TIMEOUT_MS = appPolicy.security.proxy_timeout_ms;
const TOKEN = /^Bearer [^\r\n]{1,4096}$/;
const TRACE_ID = /^[A-Za-z0-9_.:-]{8,160}$/;

const STATIC_ASSETS = new Map([
  ['/', asset('index.html', 'text/html; charset=utf-8')],
  ['/index.html', asset('index.html', 'text/html; charset=utf-8')],
  ['/app.mjs', asset('app.mjs', 'text/javascript; charset=utf-8')],
  ['/presentation.mjs', asset('presentation.mjs', 'text/javascript; charset=utf-8')],
  ['/local-organize.mjs', asset('local-organize.mjs', 'text/javascript; charset=utf-8')],
  ['/human-contract.json', asset('human-contract.json', 'application/json; charset=utf-8')],
  ['/styles.css', asset('styles.css', 'text/css; charset=utf-8')],
  ['/manifest.webmanifest', asset('manifest.webmanifest', 'application/manifest+json')],
  ['/sw.mjs', asset('sw.mjs', 'text/javascript; charset=utf-8')],
  ['/icon.svg', asset('icon.svg', 'image/svg+xml')],
  ['/vendor/axiom-client.mjs', {
    path: join(REPOSITORY_ROOT, 'packages', 'axiom-client', 'index.mjs'),
    contentType: 'text/javascript; charset=utf-8'
  }],
  ['/mesh/config/gateway-client-contract.json', {
    path: join(REPOSITORY_ROOT, 'mesh', 'config', 'gateway-client-contract.json'),
    contentType: 'application/json; charset=utf-8'
  }]
]);

const ROUTES = gatewayContract.routes.map(route => ({
  ...route,
  matcher: new RegExp(`^${route.path.replace(/:[a-z][a-z0-9_]*/g, '[^/]+')}$`)
}));

export async function startAxiomOnePreview({
  host = LOOPBACK_HOST,
  port = appPolicy.network.default_port,
  gatewayOrigin = appPolicy.network.default_gateway_origin,
  fetchImpl = globalThis.fetch
} = {}) {
  validatePreviewConfiguration({ host, port, gatewayOrigin, fetchImpl });
  const normalizedGatewayOrigin = normalizeGatewayOrigin(gatewayOrigin);
  let activePort = port;
  const server = createServer((req, res) => {
    handleRequest({
      req,
      res,
      port: activePort,
      gatewayOrigin: normalizedGatewayOrigin,
      fetchImpl
    }).catch(() => {
      if (!res.headersSent) sendPlain(res, 500, 'Local preview request failed');
      else if (!res.writableEnded) res.end();
    });
  });
  server.requestTimeout = 35_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolveListen);
  });
  activePort = server.address().port;
  return {
    name: 'axiom-one-preview',
    host,
    port: activePort,
    url: `http://${host}:${activePort}`,
    gateway_origin: normalizedGatewayOrigin,
    stop: () => new Promise((resolveStop, reject) => {
      server.close(error => error ? reject(error) : resolveStop());
    })
  };
}

export function validatePreviewConfiguration({ host, port, gatewayOrigin, fetchImpl }) {
  if (host !== LOOPBACK_HOST) throw new Error('AXIOM One preview must bind IPv4 loopback');
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('AXIOM One preview port is invalid');
  }
  normalizeGatewayOrigin(gatewayOrigin);
  if (typeof fetchImpl !== 'function') throw new Error('AXIOM One preview requires fetch');
  return true;
}

async function handleRequest({ req, res, port, gatewayOrigin, fetchImpl }) {
  if (!validHost(req.headers.host, port)) {
    sendPlain(res, 421, 'Loopback host required');
    return;
  }
  let url;
  try {
    url = new URL(req.url, 'http://127.0.0.1');
  } catch {
    sendPlain(res, 400, 'Invalid request target');
    return;
  }
  if (url.pathname === '/app-health') {
    if (!['GET', 'HEAD'].includes(req.method)) {
      sendPlain(res, 405, 'Method not allowed', { allow: 'GET, HEAD' });
      return;
    }
    sendJson(res, 200, {
      schema: appPolicy.schema,
      status: 'live',
      kernel_version: appPolicy.kernel_version,
      support: appPolicy.status
    }, req.method === 'HEAD');
    return;
  }
  if (url.pathname === '/local/verify') {
    await handleLocalVerify(req, res);
    return;
  }
  if (url.pathname.startsWith('/v1/')) {
    await proxyGateway({ req, res, url, gatewayOrigin, fetchImpl });
    return;
  }
  await serveStatic(req, res, url);
}

async function handleLocalVerify(req, res) {
  if (req.method !== 'POST') {
    sendPlain(res, 405, 'Method not allowed', { allow: 'POST' });
    return;
  }
  if (!validBrowserBoundary(req)) {
    sendJson(res, 403, {
      error: {
        code: 'forbidden',
        message: 'Cross-origin preview request denied'
      }
    });
    return;
  }
  if (mediaType(req.headers['content-type']) !== 'application/json') {
    sendJson(res, 415, {
      error: {
        code: 'validation_error',
        message: 'Local verify request must be JSON'
      }
    });
    return;
  }
  let raw;
  try {
    raw = await readRequest(req, MAX_REQUEST_BYTES);
  } catch {
    sendJson(res, 413, {
      error: {
        code: 'body_too_large',
        message: 'Request exceeds the preview byte limit'
      }
    });
    return;
  }
  let input;
  try {
    input = JSON.parse(raw.toString('utf8'));
  } catch {
    sendJson(res, 400, {
      error: {
        code: 'validation_error',
        message: 'Local verify body is not valid JSON'
      }
    });
    return;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    sendJson(res, 400, {
      error: {
        code: 'validation_error',
        message: 'Local verify body must be a plain object'
      }
    });
    return;
  }
  const report = runLocalVerify(input);
  sendJson(res, 200, {
    ...report,
    verify_transport: 'axiom-one-loopback-local-verify',
    gateway_authority_client: false,
    experimental: true,
    non_claims: [
      'not-a-released-verify-product',
      'not-mesh-production-promotion',
      'pass-is-not-external-world-truth',
      'hermes-pin-provisional',
      'sec-002-pending'
    ]
  });
}

function runLocalVerify(input) {
  const publicKeyPem = input.public_key_pem;
  if (typeof publicKeyPem !== 'string' || !publicKeyPem.includes('BEGIN')) {
    return buildVerificationReport({
      ok: false,
      code: 'missing_public_key',
      reason:
        'Owner-supplied verification public key PEM is required. Local Verify does not fetch keys from Gateway and is not an authority client.',
      schema: null
    });
  }

  let mode = typeof input.mode === 'string' ? input.mode : 'auto';
  if (!['auto', 'receipt', 'continuity', 'export'].includes(mode)) {
    return buildVerificationReport({
      ok: false,
      code: 'invalid_mode',
      reason: `Unsupported local verify mode '${mode}'`,
      schema: null
    });
  }

  const artifact = input.artifact;
  if (mode === 'auto') {
    mode = detectVerifyMode(artifact, input);
  }

  try {
    if (mode === 'receipt') {
      return verifyMachineReceiptLike(artifact, { publicKeyPem }).report;
    }
    if (mode === 'continuity') {
      return verifyContinuityAnchor(artifact, {
        publicKeyPem,
        chainSegment: input.chain_segment
      }).report;
    }
    if (mode === 'export') {
      const packageInput = normalizeExportPackageInput(artifact, input);
      return verifyExportPackage(packageInput, { publicKeyPem }).report;
    }
  } catch (error) {
    return buildVerificationReport({
      ok: false,
      code: 'verify_exception',
      reason: `Local Verify failed closed: ${error?.message ?? 'unknown error'}`,
      schema: null
    });
  }

  return buildVerificationReport({
    ok: false,
    code: 'invalid_mode',
    reason: `Unsupported local verify mode '${mode}'`,
    schema: null
  });
}

function detectVerifyMode(artifact, input) {
  const value = plainJsonObject(artifact) ?? (
    typeof artifact === 'string'
      ? (() => {
        try {
          return plainJsonObject(JSON.parse(artifact));
        } catch {
          return null;
        }
      })()
      : null
  );
  if (value?.schema === MACHINE_INTENT_RECEIPT_SCHEMA) return 'receipt';
  if (value?.schema === GRID_CONTINUITY_ANCHOR_SCHEMA) return 'continuity';
  if (
    value?.format === EXPORT_PACKAGE_FORMAT
    || value?.manifest !== undefined
    || input?.files !== undefined
  ) return 'export';
  return 'receipt';
}

function normalizeExportPackageInput(artifact, input) {
  let base = artifact;
  if (typeof artifact === 'string') {
    try {
      base = JSON.parse(artifact);
    } catch {
      return artifact;
    }
  }
  if (!base || typeof base !== 'object' || Array.isArray(base)) return artifact;
  if (base.manifest !== undefined && (base.files !== undefined || input.files === undefined)) {
    return decodeExportFiles(base);
  }
  return decodeExportFiles({
    manifest: base.manifest ?? base,
    files: input.files ?? base.files ?? {}
  });
}

function decodeExportFiles(packageInput) {
  if (!packageInput || typeof packageInput !== 'object' || Array.isArray(packageInput)) {
    return packageInput;
  }
  const files = packageInput.files;
  if (!files || typeof files !== 'object' || Array.isArray(files)) return packageInput;
  const decoded = {};
  for (const [name, value] of Object.entries(files)) {
    if (typeof value === 'string' && value.startsWith('base64:')) {
      decoded[name] = Buffer.from(value.slice('base64:'.length), 'base64');
    } else {
      decoded[name] = value;
    }
  }
  return { ...packageInput, files: decoded };
}

function plainJsonObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

async function serveStatic(req, res, url) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    sendPlain(res, 405, 'Method not allowed', { allow: 'GET, HEAD' });
    return;
  }
  if (url.search || url.hash) {
    sendPlain(res, 404, 'Not found');
    return;
  }
  const selected = STATIC_ASSETS.get(url.pathname);
  if (!selected) {
    sendPlain(res, 404, 'Not found');
    return;
  }
  const body = await readFile(selected.path);
  res.writeHead(200, securityHeaders({
    'content-type': selected.contentType,
    'content-length': String(body.length),
    'cache-control': 'no-cache, no-store, must-revalidate'
  }));
  res.end(req.method === 'HEAD' ? undefined : body);
}

async function proxyGateway({ req, res, url, gatewayOrigin, fetchImpl }) {
  const traceId = validTrace(req.headers['x-trace-id'])
    ? req.headers['x-trace-id']
    : `preview_${crypto.randomUUID()}`;
  if (
    `${url.pathname}${url.search}`.length
    > gatewayContract.limits.maximum_target_length
  ) {
    sendApiError(res, 400, 'validation_error', 'Gateway target exceeds the preview length limit', traceId);
    return;
  }
  const route = ROUTES.find(candidate => (
    candidate.method === req.method && candidate.matcher.test(url.pathname)
  ));
  if (!route || !allowedQuery(route, url.searchParams)) {
    sendApiError(res, 404, 'not_found', 'Gateway route is not in the preview contract', traceId);
    return;
  }
  if (!validBrowserBoundary(req)) {
    sendApiError(res, 403, 'forbidden', 'Cross-origin preview request denied', traceId);
    return;
  }
  if (!TOKEN.test(req.headers.authorization ?? '')) {
    sendApiError(res, 401, 'authentication_required', 'A valid local bearer token is required', traceId);
    return;
  }
  let body;
  if (route.method === 'POST') {
    if (mediaType(req.headers['content-type']) !== 'application/json') {
      sendApiError(res, 415, 'validation_error', 'Gateway request must be JSON', traceId);
      return;
    }
    if (!validIdempotency(req.headers['idempotency-key'])) {
      sendApiError(res, 400, 'validation_error', 'A valid idempotency key is required', traceId);
      return;
    }
    try {
      body = await readRequest(req, MAX_REQUEST_BYTES);
    } catch {
      sendApiError(res, 413, 'body_too_large', 'Request exceeds the preview byte limit', traceId);
      return;
    }
  } else if (
    req.headers['transfer-encoding'] !== undefined
    || Number(req.headers['content-length'] ?? 0) > 0
  ) {
    sendApiError(res, 400, 'validation_error', 'Read routes do not accept a body', traceId);
    return;
  }

  const headers = {
    accept: req.headers.accept ?? route.response_media_type,
    authorization: req.headers.authorization,
    'x-trace-id': traceId,
    ...(body ? {
      'content-type': 'application/json',
      'idempotency-key': req.headers['idempotency-key']
    } : {})
  };
  let upstream;
  try {
    upstream = await fetchImpl(`${gatewayOrigin}${url.pathname}${url.search}`, {
      method: route.method,
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS)
    });
  } catch {
    sendApiError(res, 503, 'dependency_unavailable', 'Local Gateway is unavailable', traceId);
    return;
  }
  let responseBody;
  try {
    responseBody = await readResponse(upstream, MAX_RESPONSE_BYTES);
  } catch {
    sendApiError(res, 502, 'response_too_large', 'Gateway response exceeds the preview byte limit', traceId);
    return;
  }
  const responseHeaders = {
    'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    'content-length': String(responseBody.length),
    'cache-control': 'no-store',
    ...(upstream.headers.get('x-trace-id')
      ? { 'x-trace-id': upstream.headers.get('x-trace-id') }
      : { 'x-trace-id': traceId }),
    ...(upstream.headers.get('retry-after')
      ? { 'retry-after': upstream.headers.get('retry-after') }
      : {})
  };
  res.writeHead(upstream.status, securityHeaders(responseHeaders));
  res.end(responseBody);
}

async function readRequest(req, maximum) {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > maximum) throw new Error('too large');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maximum) throw new Error('too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readResponse(response, maximum) {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maximum) throw new Error('too large');
  if (typeof response.body?.getReader !== 'function') throw new Error('invalid response');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel().catch(() => {});
      throw new Error('too large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size);
}

function allowedQuery(route, searchParams) {
  const entries = [...searchParams.entries()];
  return entries.length <= gatewayContract.limits.maximum_query_values
    && entries.every(([name, value]) => (
      route.query_parameters.includes(name)
      && value.length <= gatewayContract.limits.maximum_query_value_length
    ));
}

function validBrowserBoundary(req) {
  const expectedOrigin = `http://${req.headers.host}`;
  const origin = req.headers.origin;
  const fetchSite = req.headers['sec-fetch-site'];
  return (!origin || origin === expectedOrigin)
    && (!fetchSite || ['same-origin', 'none'].includes(fetchSite));
}

function validHost(value, port) {
  return value === `${LOOPBACK_HOST}:${port}` || value === `localhost:${port}`;
}

function validTrace(value) {
  return typeof value === 'string' && TRACE_ID.test(value);
}

function validIdempotency(value) {
  return typeof value === 'string'
    && value.length >= 16
    && value.length <= 160
    && /^[A-Za-z0-9_.:-]+$/.test(value);
}

function normalizeGatewayOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('AXIOM One Gateway origin is invalid');
  }
  if (
    url.protocol !== 'http:'
    || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || !url.port
  ) throw new Error('AXIOM One Gateway origin must be an explicit loopback HTTP origin');
  return url.origin;
}

function mediaType(value = '') {
  return value.split(';', 1)[0].trim().toLowerCase();
}

function sendApiError(res, status, code, message, traceId) {
  sendJson(res, status, {
    error: { code, message },
    trace_id: traceId
  });
}

function sendJson(res, status, value, head = false) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, securityHeaders({
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store'
  }));
  res.end(head ? undefined : body);
}

function sendPlain(res, status, message, headers = {}) {
  const body = Buffer.from(message);
  res.writeHead(status, securityHeaders({
    'content-type': 'text/plain; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
    ...headers
  }));
  res.end(body);
}

function securityHeaders(headers) {
  return {
    'content-security-policy': [
      "default-src 'self'",
      "base-uri 'none'",
      "connect-src 'self'",
      "font-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "worker-src 'self'"
    ].join('; '),
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'origin-agent-cluster': '?1',
    'permissions-policy': 'camera=(), display-capture=(), geolocation=(), microphone=(), payment=(), usb=()',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    ...headers
  };
}

function asset(name, contentType) {
  return { path: join(APP_ROOT, name), contentType };
}

async function main() {
  const port = integerEnvironment('AXIOM_ONE_PORT', appPolicy.network.default_port);
  const preview = await startAxiomOnePreview({
    port,
    gatewayOrigin: process.env.AXIOM_GATEWAY_ORIGIN
      ?? appPolicy.network.default_gateway_origin
  });
  process.stdout.write(`${JSON.stringify({
    message: 'AXIOM One local preview ready',
    url: preview.url,
    gateway_origin: preview.gateway_origin,
    support: appPolicy.status,
    token_created: false
  })}\n`);
  const stop = async () => {
    await preview.stop();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

function integerEnvironment(name, fallback) {
  if (process.env[name] === undefined) return fallback;
  const value = Number(process.env[name]);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
