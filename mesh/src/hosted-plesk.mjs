import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import { assertProductionRuntime } from './setup.mjs';

const MAX_BODY_BYTES = 1_048_576;
const MAX_SOCKET_BYTES = 100;
const SOCKET_TIMEOUT_MS = 30_000;
const MESH_ROOT = fileURLToPath(new URL('..', import.meta.url));
const NAMESPACE_ENTRY = fileURLToPath(new URL('./hosted-namespace.mjs', import.meta.url));
const REQUIRED_FLAGS = Object.freeze({
  NODE_ENV: 'production',
  AXIOM_AUTO_BOOTSTRAP: 'false',
  AXIOM_REQUIRE_DENY_EGRESS: 'true',
  AXIOM_INTERNAL_TLS: 'true',
  AXIOM_GATEWAY_HOST: '127.0.0.1',
  AXIOM_INTERNAL_HOST: '127.0.0.1'
});
const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
  '.zip': 'application/zip'
});

export function validateHostedProductionConfig({
  environment = process.env,
  runtimeVersion = process.version,
  applicationRoot = environment.AXIOM_APPLICATION_ROOT ?? process.cwd()
} = {}) {
  assertProductionRuntime(runtimeVersion);
  const root = absolutePath(applicationRoot, 'application root');
  const documentRoot = absolutePath(
    environment.AXIOM_DOCUMENT_ROOT ?? join(root, 'public'),
    'document root'
  );
  if (!isStrictChild(documentRoot, root)) {
    throw new ValidationError(
      'Hosted production document root must be a private application-root subdirectory'
    );
  }

  const privateRoot = join(root, 'private');
  const secretRoot = join(privateRoot, 'secrets');
  const config = {
    applicationRoot: root,
    documentRoot,
    dataDir: absolutePath(environment.AXIOM_DATA_DIR ?? join(privateRoot, 'data'), 'data directory'),
    dataKeyFile: absolutePath(
      environment.AXIOM_DATA_KEY_FILE ?? join(secretRoot, 'data-protection.key'),
      'data-protection key'
    ),
    apiTokensFile: absolutePath(
      environment.AXIOM_API_TOKENS_FILE ?? join(secretRoot, 'api-tokens.json'),
      'API-token registry'
    ),
    transportDir: absolutePath(
      environment.AXIOM_TRANSPORT_DIR ?? join(secretRoot, 'transport'),
      'transport credential directory'
    ),
    gatewaySocket: absolutePath(
      environment.AXIOM_GATEWAY_SOCKET ?? join(privateRoot, 'run', 'gateway.sock'),
      'Gateway Unix socket'
    ),
    port: parsePassengerPort(environment.PORT),
    sourceEnvironment: environment
  };

  for (const [key, required] of Object.entries(REQUIRED_FLAGS)) {
    if (environment[key] !== undefined && environment[key] !== required) {
      throw new ValidationError(`Hosted production requires ${key}=${required}`);
    }
  }
  for (const key of ['AXIOM_DATA_KEY', 'AXIOM_API_TOKENS']) {
    if (environment[key]) {
      throw new ValidationError(`Hosted production requires private credential files; ${key} is forbidden`);
    }
  }
  for (const value of [
    config.dataDir,
    config.dataKeyFile,
    config.apiTokensFile,
    config.transportDir,
    config.gatewaySocket
  ]) {
    assertPrivateLocation(value, root, documentRoot);
  }
  if (Buffer.byteLength(config.gatewaySocket) > MAX_SOCKET_BYTES) {
    throw new ValidationError('Hosted production Gateway Unix socket exceeds the 100-byte limit');
  }
  return config;
}

export async function assertHostedProductionFilesystem(config) {
  const root = await realpath(config.applicationRoot);
  const publicRoot = await realpath(config.documentRoot);
  if (!isStrictChild(publicRoot, root)) {
    throw new ValidationError('Hosted production document root resolves outside the application root');
  }

  const directories = new Set([
    dirname(config.dataDir),
    config.dataDir,
    dirname(config.dataKeyFile),
    dirname(config.apiTokensFile),
    config.transportDir,
    dirname(config.gatewaySocket)
  ]);
  for (const path of directories) {
    assertPrivateLocation(path, config.applicationRoot, config.documentRoot);
    const canonical = await realpath(path);
    assertPrivateLocation(canonical, root, publicRoot);
    const metadata = await stat(path);
    if (!metadata.isDirectory() || (metadata.mode & 0o077) !== 0) {
      throw new ValidationError('Hosted production private directory must have private permissions');
    }
  }

  for (const path of [config.dataKeyFile, config.apiTokensFile]) {
    assertPrivateLocation(path, config.applicationRoot, config.documentRoot);
    const canonical = await realpath(path);
    assertPrivateLocation(canonical, root, publicRoot);
    const metadata = await stat(path);
    if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
      throw new ValidationError('Hosted production credential file must have private permissions');
    }
  }
}

export function buildHostedNamespaceLaunch(config) {
  const inherited = config.sourceEnvironment;
  const environment = {
    ...(inherited.PATH ? { PATH: inherited.PATH } : {}),
    ...(inherited.LANG ? { LANG: inherited.LANG } : {}),
    ...(inherited.TZ ? { TZ: inherited.TZ } : {}),
    ...REQUIRED_FLAGS,
    AXIOM_DATA_DIR: config.dataDir,
    AXIOM_DATA_KEY: '',
    AXIOM_DATA_KEY_FILE: config.dataKeyFile,
    AXIOM_API_TOKENS: '',
    AXIOM_API_TOKENS_FILE: config.apiTokensFile,
    AXIOM_TRANSPORT_DIR: config.transportDir,
    AXIOM_GATEWAY_SOCKET: config.gatewaySocket
  };
  return {
    command: 'unshare',
    arguments: [
      '--user',
      '--map-root-user',
      '--net',
      '--',
      process.execPath,
      NAMESPACE_ENTRY
    ],
    cwd: MESH_ROOT,
    environment
  };
}

export function createHostedIngress(config) {
  const server = createServer((incoming, outgoing) => {
    serveHostedRequest(config, incoming, outgoing).catch(() => {
      if (outgoing.headersSent) {
        outgoing.destroy();
        return;
      }
      outgoing.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      outgoing.end('Internal server error');
    });
  });
  server.requestTimeout = SOCKET_TIMEOUT_MS;
  server.headersTimeout = SOCKET_TIMEOUT_MS;
  server.maxHeadersCount = 64;
  return server;
}

export async function startHostedProduction({
  environment = process.env,
  spawnImpl = spawn,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  const config = validateHostedProductionConfig({ environment });
  await assertHostedProductionFilesystem(config);
  const launch = buildHostedNamespaceLaunch(config);
  const child = spawnImpl(launch.command, launch.arguments, {
    cwd: launch.cwd,
    env: launch.environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  child.stdout?.pipe(stdout, { end: false });
  child.stderr?.pipe(stderr, { end: false });

  const server = createHostedIngress(config);
  child.once('error', () => {
    server.close();
    process.exitCode = 1;
  });
  child.once('exit', code => {
    server.close();
    if (code !== 0) process.exitCode = 1;
  });
  const stop = () => {
    server.close();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(config.port, resolveListen);
  });
  return { server, child, config, stop };
}

async function serveHostedRequest(config, incoming, outgoing) {
  let target;
  try {
    target = new URL(incoming.url, 'http://axiom-host.invalid');
  } catch {
    respond(outgoing, 400, 'Bad request');
    return;
  }

  if (target.pathname === '/ready' || target.pathname.startsWith('/v1/')) {
    await proxyToPrivateGateway(config, incoming, outgoing, `${target.pathname}${target.search}`);
    return;
  }
  if (!['GET', 'HEAD'].includes(incoming.method)) {
    respond(outgoing, 405, 'Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(target.pathname);
  } catch {
    respond(outgoing, 400, 'Bad request');
    return;
  }
  let candidate = resolve(config.documentRoot, `.${pathname}`);
  if (candidate !== config.documentRoot && !isStrictChild(candidate, config.documentRoot)) {
    respond(outgoing, 403, 'Forbidden');
    return;
  }
  let metadata;
  try {
    metadata = await stat(candidate);
    if (metadata.isDirectory()) {
      candidate = join(candidate, 'index.html');
      metadata = await stat(candidate);
    }
    const canonical = await realpath(candidate);
    const publicRoot = await realpath(config.documentRoot);
    if (!isStrictChild(canonical, publicRoot)) {
      respond(outgoing, 403, 'Forbidden');
      return;
    }
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      respond(outgoing, 404, 'Not found');
      return;
    }
    throw error;
  }
  if (!metadata.isFile()) {
    respond(outgoing, 404, 'Not found');
    return;
  }
  outgoing.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(candidate).toLowerCase()] ?? 'application/octet-stream',
    'content-length': metadata.size,
    'x-content-type-options': 'nosniff'
  });
  if (incoming.method === 'HEAD') {
    outgoing.end();
    return;
  }
  const file = createReadStream(candidate);
  file.once('error', () => outgoing.destroy());
  file.pipe(outgoing);
}

async function proxyToPrivateGateway(config, incoming, outgoing, pathname) {
  const contentLength = incoming.headers['content-length'];
  if (
    contentLength !== undefined
    && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)
  ) {
    respond(outgoing, 413, 'Request body exceeds the limit');
    incoming.resume();
    return;
  }
  const headers = { ...incoming.headers, host: 'localhost' };
  delete headers.connection;
  delete headers['proxy-authorization'];
  delete headers['proxy-connection'];
  const upstream = httpRequest({
    socketPath: config.gatewaySocket,
    path: pathname,
    method: incoming.method,
    headers,
    timeout: SOCKET_TIMEOUT_MS,
    agent: false
  }, response => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.once('error', () => {
    if (!outgoing.headersSent) respond(outgoing, 503, 'AXIOM is not ready');
    else outgoing.destroy();
  });
  upstream.once('timeout', () => upstream.destroy());
  let bytes = 0;
  incoming.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      upstream.destroy();
      if (!outgoing.headersSent) respond(outgoing, 413, 'Request body exceeds the limit');
      incoming.destroy();
    }
  });
  incoming.once('aborted', () => upstream.destroy());
  incoming.pipe(upstream);
}

function respond(response, status, message) {
  if (response.headersSent) return;
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(message);
}

function parsePassengerPort(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new ValidationError('Hosted production requires a numeric Passenger PORT');
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new ValidationError('Hosted production Passenger PORT is outside the valid range');
  }
  return port;
}

function absolutePath(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new ValidationError(`Hosted production ${label} must be an absolute path`);
  }
  return resolve(value);
}

function assertPrivateLocation(value, applicationRoot, documentRoot) {
  if (!isStrictChild(value, applicationRoot)) {
    throw new ValidationError('Hosted production private path resolves outside the application root');
  }
  if (value === documentRoot || isStrictChild(value, documentRoot)) {
    throw new ValidationError('Hosted production private path must remain outside the public document root');
  }
}

function isStrictChild(value, parent) {
  const difference = relative(parent, value);
  return Boolean(difference)
    && difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference);
}
