import https from 'node:https';
import { AxiomError } from './canonical.mjs';
import { signedRequestHeaders } from './identity.mjs';
import {
  serviceDnsName,
  verifyTransportServerIdentity
} from './transport-credentials.mjs';

export async function signedFetch(identity, audience, url, {
  method = 'GET',
  body,
  traceId,
  timeoutMs = 10_000,
  headers = {}
} = {}) {
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
        timeoutMs
      })
    : await ordinaryRequest({
        url,
        method,
        body: encoded,
        headers: requestHeaders,
        timeoutMs
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
      checkServerIdentity: (_hostname, peer) => (
        verifyTransportServerIdentity(transport, audience, peer)
      ),
      agent: false
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
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('Mutually authenticated request timed out'));
    });
    request.once('error', reject);
    if (body.length) request.write(body);
    request.end();
  });
}
