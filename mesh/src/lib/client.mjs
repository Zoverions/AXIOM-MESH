import { AxiomError } from './canonical.mjs';
import { signedRequestHeaders } from './identity.mjs';

export async function signedFetch(identity, audience, url, {
  method = 'GET',
  body,
  traceId,
  timeoutMs = 10_000,
  headers = {}
} = {}) {
  const encoded = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  const authHeaders = signedRequestHeaders(identity, { method, url, audience, body: encoded });
  const response = await fetch(url, {
    method,
    body: encoded.length ? encoded : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: 'application/json',
      ...(encoded.length ? { 'content-type': 'application/json' } : {}),
      ...(traceId ? { 'x-trace-id': traceId } : {}),
      ...authHeaders,
      ...headers
    }
  });
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const remote = payload?.error;
    throw new AxiomError(
      remote?.code ?? 'upstream_error',
      remote?.message ?? `Upstream request failed with HTTP ${response.status}`,
      response.status === 503 ? 503 : response.status >= 500 ? 502 : response.status,
      remote?.details
    );
  }
  return payload;
}
