import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { adaptMeshStatusV1, normalizeSourceUpdateTime } from './coordination.mjs';

const MAX_BYTES = 64 * 1024;
const TIMEOUT_MS = 5_000;
const BEARER_PATTERN = /^[A-Za-z0-9._~+/-]{16,4096}={0,2}$/;

function validateSourceUrl(sourceUrl) {
  let url;
  try { url = new URL(sourceUrl); } catch { throw new Error('Invalid loopback source URL'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
      || url.username || url.password || url.search || url.hash || !url.pathname.startsWith('/')) {
    throw new Error('Invalid loopback source URL');
  }
  return url.href;
}

async function loadSourceToken(tokenFile) {
  if (typeof tokenFile !== 'string' || !isAbsolute(tokenFile)) throw new Error('Invalid token file path');
  let handle;
  try {
    handle = await open(tokenFile, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || (info.mode & 0o077) !== 0
        || info.uid !== process.getuid() || info.size > 4096) throw new Error('Unsafe token file permissions');
    const token = (await handle.readFile('utf8')).trim();
    if (!BEARER_PATTERN.test(token)) throw new Error('Invalid source token');
    return token;
  } catch (error) {
    if (error?.code === 'ELOOP') throw new Error('Unsafe token file permissions');
    throw error;
  } finally {
    await handle?.close();
  }
}

function sourceRevision(response, source) {
  const header = response.headers.get('x-mesh-revision');
  if (header !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(header)) throw new Error('Invalid source revision');
    const revision = Number(header);
    if (!Number.isSafeInteger(revision)) throw new Error('Invalid source revision');
    return { revision_kind: 'header', revision };
  }
  // Shared normalization makes ISO and epoch-ms updates use the same ordering.
  const observed = normalizeSourceUpdateTime(source?.updated_at);
  if (observed !== null) {
    const revision = Date.parse(observed);
    if (Number.isSafeInteger(revision) && revision >= 0) {
      return { revision_kind: 'timestamp', revision };
    }
  }
  return { revision_kind: 'unversioned', revision: null };
}

async function boundedJson(response) {
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new Error('Source response is not JSON');
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new Error('Source response too large');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    if (size > MAX_BYTES) throw new Error('Source response too large');
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks);
  try { return { source: JSON.parse(bytes.toString('utf8')),
    contentDigest: createHash('sha256').update(bytes).digest('hex') }; }
  catch { throw new Error('Invalid source JSON'); }
}

// Deliberately unwired. A future server route must authenticate its browser
// principal separately and project the result through deriveCoordinationView.
export async function readMeshStatus({ sourceUrl = process.env.MESH_STATUS_URL, tokenFile,
  bearer = tokenFile === undefined ? process.env.MESH_STATUS_BEARER : undefined,
  sourceId, audienceId,
  fetchImpl = globalThis.fetch } = {}) {
  const url = validateSourceUrl(sourceUrl);
  if (typeof fetchImpl !== 'function' || !/^[A-Za-z0-9_.:-]{1,80}$/.test(sourceId ?? '')
      || !/^[A-Za-z0-9_.:-]{1,80}$/.test(audienceId ?? '')) throw new Error('Invalid source configuration');
  if (tokenFile !== undefined && bearer !== undefined) throw new Error('Ambiguous source credentials');
  const token = tokenFile === undefined ? bearer : await loadSourceToken(tokenFile);
  if (typeof token !== 'string' || !BEARER_PATTERN.test(token)) throw new Error('Invalid source token');
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', redirect: 'error',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'cache-control': 'no-store' },
      signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch { throw new Error('Source unavailable'); }
  if (response.status === 401 || response.status === 403) throw new Error('Source unauthorized');
  if (response.status !== 200) throw new Error('Source unavailable');
  const { source, contentDigest } = await boundedJson(response);
  return adaptMeshStatusV1(source, { source_id: sourceId, audience_id: audienceId,
    ...sourceRevision(response, source), content_digest: contentDigest });
}
