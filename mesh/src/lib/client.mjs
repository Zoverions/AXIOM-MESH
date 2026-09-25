import https from 'node:https';
import { AxiomError, ValidationError, sha256 } from './canonical.mjs';
import { signedRequestHeaders } from './identity.mjs';
import { evaluateMachineIntentWithAssurance } from './agent-assurance-authority-binding.mjs';
import { validatePlan } from './plan.mjs';
import {
  serviceDnsName,
  verifyTransportServerIdentity
} from './transport-credentials.mjs';
import { authorizeServiceRequest } from './service-network-policy.mjs';
import { registerTransportMetrics } from './observability.mjs';

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_REQUEST_TIMEOUT_MS = 300_000;

// Keep-alive pools for mutually authenticated internal calls (scalability
// audit S-04). Every hop used to open a new TCP and TLS 1.3 connection.
// A pool serves one caller service, one audience and one origin under one
// credential generation: the caller's certificate, key and trusted CA, and
// the pinned fingerprint of the audience's certificate. A reused socket skips
// the TLS handshake and so every identity check, which is safe only because
// the socket was opened under exactly this generation. A new generation gets
// a new pool and the old one drains: its idle sockets close and busy ones
// close when released.
// The server identity check belongs to the pool, not the request: Node 22
// never keeps a socket alive that was opened with a per-request
// checkServerIdentity, and the check depends only on what the pool is keyed by.
// Idle sockets close after 4 s, before the services' 5 s keep-alive timeout,
// so a request is never written to a socket the server is closing.
const TRANSPORT_POOL_LIMITS = Object.freeze({
  maxSockets: 64,
  maxFreeSockets: 16,
  idleTimeoutMs: 4_000
});
const transportPools = new Map();
const transportPoolCounters = { connections: 0, reused: 0, drained_pools: 0 };
registerTransportMetrics('transport-pools', () => ({
  pool_connections_total: transportPoolCounters.connections,
  pool_reused_total: transportPoolCounters.reused,
  pool_drained_total: transportPoolCounters.drained_pools
}));

function transportAgent(transport, audience, target) {
  const scope = `${transport.service}\u0000${audience}\u0000${target.origin}`;
  const generation = sha256([
    transport.cert,
    transport.key,
    transport.ca,
    transport.peers?.[audience] ?? ''
  ].join('\u0000'));
  const existing = transportPools.get(scope);
  if (existing?.generation === generation) return existing.agent;
  if (existing) drainAgent(existing.agent);
  const agent = new https.Agent({
    keepAlive: true,
    maxSockets: TRANSPORT_POOL_LIMITS.maxSockets,
    maxFreeSockets: TRANSPORT_POOL_LIMITS.maxFreeSockets,
    timeout: TRANSPORT_POOL_LIMITS.idleTimeoutMs,
    scheduling: 'lifo',
    checkServerIdentity: (_hostname, peer) => (
      verifyTransportServerIdentity(transport, audience, peer)
    )
  });
  transportPools.set(scope, { generation, agent });
  return agent;
}

function drainAgent(agent) {
  agent.keepAlive = false;
  for (const sockets of Object.values(agent.freeSockets)) {
    for (const socket of sockets) socket.destroy();
  }
  transportPoolCounters.drained_pools += 1;
}

/** Connection reuse evidence for the internal transport pools. */
export function transportPoolStats() {
  return Object.freeze({
    pools: transportPools.size,
    ...transportPoolCounters,
    limits: TRANSPORT_POOL_LIMITS
  });
}

/**
 * Closes every pooled internal connection now. Idle pooled sockets are
 * unreferenced, so they never hold a process open; this is for tests and for
 * callers that want connections closed immediately.
 */
export function closeTransportPools() {
  for (const { agent } of transportPools.values()) agent.destroy();
  transportPools.clear();
}

export async function signedFetch(identity, audience, url, {
  method = 'GET',
  body,
  traceId,
  timeoutMs,
  headers = {}
} = {}) {
  authorizeServiceRequest({
    source: identity?.service,
    destination: audience,
    method,
    url
  });
  const effectiveTimeoutMs = resolveSignedFetchTimeoutMs({
    audience,
    url,
    body,
    timeoutMs
  });
  const encoded = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  const authHeaders = signedRequestHeaders(identity, { method, url, audience, body: encoded });
  const requestHeaders = {
    accept: 'application/json',
    ...(encoded.length ? {
      'content-type': 'application/json',
      'content-length': String(encoded.length)
    } : {}),
    ...(traceId ? { 'x-trace-id': traceId } : {}),
    ...authHeaders,
    ...headers
  };
  const target = new URL(url);
  const response = target.protocol === 'https:'
    ? await mutuallyAuthenticatedRequest({
        identity,
        audience,
        target,
        method,
        body: encoded,
        headers: requestHeaders,
        timeoutMs: effectiveTimeoutMs
      })
    : await ordinaryRequest({
        // Send exactly the path that was signed. The signature covers the
        // URL-normalized pathname and search, so the raw text (an empty
        // trailing `?`, a fragment) must not reach the wire instead.
        url: `${target.origin}${target.pathname}${target.search}`,
        method,
        body: encoded,
        headers: requestHeaders,
        timeoutMs: effectiveTimeoutMs
      });
  if (!response.ok) {
    const payload = response.payload;
    const remote = payload?.error;
    throw new AxiomError(
      remote?.code ?? 'upstream_error',
      remote?.message ?? `Upstream request failed with HTTP ${response.status}`,
      response.status === 503 ? 503 : response.status >= 500 ? 502 : response.status,
      remote?.details
    );
  }
  return response.payload;
}

export function resolveSignedFetchTimeoutMs({
  audience,
  url,
  body,
  timeoutMs
} = {}) {
  const explicitTimeoutMs = normalizeTimeout(timeoutMs);
  const target = new URL(url);
  const isSandboxExecution = (
    audience === 'sandbox'
    && target.pathname === '/internal/v1/execute'
  );
  if (!isSandboxExecution) {
    return explicitTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  const plan = validatePlan(body?.plan);
  const executionSteps = plan.steps.filter(step => (
    step.id === 'execute'
    && step.audience === 'sandbox'
  ));
  if (executionSteps.length !== 1) {
    throw new ValidationError(
      'Sandbox execution requires exactly one plan-bound execute timeout'
    );
  }
  const planTimeoutMs = executionSteps[0].timeout_ms;
  if (explicitTimeoutMs !== null && explicitTimeoutMs !== planTimeoutMs) {
    throw new ValidationError(
      'Sandbox execution timeout must match the digest-bound plan timeout'
    );
  }

  const principal = body?.intent?.principal;
  const assuranceRules = plan.decision_provenance.rules.filter(rule => (
    typeof rule === 'string' && rule.startsWith('agent-assurance:')
  ));
  if (principal?.schema === 'axiom-machine-principal.v1') {
    const machineDecision = evaluateMachineIntentWithAssurance(principal, {
      action: body?.intent?.action,
      purpose: body?.intent?.purpose,
      requested_execution_ms: planTimeoutMs,
      assurance_evidence: body?.intent?.assurance_evidence
    });
    if (!machineDecision.allow) {
      throw new AxiomError(
        machineDecision.code,
        machineDecision.reason,
        403
      );
    }
    if (machineDecision.assurance) {
      const expectedRule = `agent-assurance:${machineDecision.assurance.evidence_digest}`;
      if (
        assuranceRules.length !== 1
        || assuranceRules[0] !== expectedRule
      ) {
        throw new ValidationError(
          'Sandbox assurance evidence does not match the digest-bound plan provenance'
        );
      }
    } else if (assuranceRules.length > 0) {
      throw new ValidationError(
        'Sandbox plan requires agent assurance evidence that is missing from the intent'
      );
    }
  } else if (assuranceRules.length > 0) {
    throw new ValidationError(
      'Non-machine sandbox plan cannot carry agent assurance provenance'
    );
  }
  return planTimeoutMs;
}

function normalizeTimeout(value) {
  if (value === undefined || value === null) return null;
  if (
    !Number.isSafeInteger(value)
    || value < 1
    || value > MAX_REQUEST_TIMEOUT_MS
  ) {
    throw new ValidationError(
      `Signed request timeout must be an integer between 1 and ${MAX_REQUEST_TIMEOUT_MS}`
    );
  }
  return value;
}

async function ordinaryRequest({
  url,
  method,
  body,
  headers,
  timeoutMs
}) {
  const response = await fetch(url, {
    method,
    body: body.length ? body : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
    headers
  });
  const contentType = response.headers.get('content-type') ?? '';
  return {
    status: response.status,
    ok: response.ok,
    payload: contentType.includes('application/json')
      ? await response.json()
      : await response.text()
  };
}

async function mutuallyAuthenticatedRequest({
  identity,
  audience,
  target,
  method,
  body,
  headers,
  timeoutMs
}) {
  const transport = identity.transport;
  if (!transport || transport.service !== identity.service) {
    throw new AxiomError(
      'transport_credentials_required',
      'Mutually authenticated transport credentials are required',
      503
    );
  }
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method,
      headers,
      key: transport.key,
      cert: transport.cert,
      ca: transport.ca,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.3',
      maxVersion: 'TLSv1.3',
      servername: serviceDnsName(audience),
      agent: transportAgent(transport, audience, target)
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 1_048_576) {
          request.destroy(new Error('Upstream response exceeds the byte limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.once('end', () => {
        const serialized = Buffer.concat(chunks).toString('utf8');
        const contentType = response.headers['content-type'] ?? '';
        let payload = serialized;
        if (contentType.includes('application/json')) {
          try {
            payload = serialized ? JSON.parse(serialized) : null;
          } catch {
            reject(new Error('Upstream returned invalid JSON'));
            return;
          }
        }
        resolve({
          status: response.statusCode ?? 0,
          ok: (
            Number.isInteger(response.statusCode)
            && response.statusCode >= 200
            && response.statusCode < 300
          ),
          payload
        });
      });
    });
    request.once('socket', () => {
      if (request.reusedSocket) transportPoolCounters.reused += 1;
      else transportPoolCounters.connections += 1;
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('Mutually authenticated request timed out'));
    });
    request.once('error', reject);
    if (body.length) request.write(body);
    request.end();
  });
}
