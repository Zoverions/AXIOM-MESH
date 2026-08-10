import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  sha256
} from '../lib/canonical.mjs';
import { normalizeRepositoryDocsProposedChanges } from '../lib/repository-docs-planning.mjs';
import { buildRepositoryDocsEffectPlan } from '../lib/repository-docs-effect.mjs';
import {
  REPOSITORY_OPERATOR_API_ORIGIN,
  REPOSITORY_OPERATOR_API_VERSION,
  REPOSITORY_OPERATOR_USER_AGENT,
  resolveRepositoryOperatorOrigin
} from './github-docs-operator.mjs';

const OWNER = 'Zoverions';
const REPO = 'AXIOM-MESH';
const MAX_TOKEN_BYTES = 4096;
const MAX_API_RESPONSE_BYTES = 2 * 1024 * 1024;
const GIT_SHA = /^[a-f0-9]{40}$/;

function gitSha(value, name) {
  return assertString(value, name, { min: 40, max: 40, pattern: GIT_SHA });
}

function encodePath(path) {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

class PlanningStatusError extends Error {
  constructor(operation, status) {
    super('Repository planning GitHub request failed');
    this.name = 'PlanningStatusError';
    this.operation = operation;
    this.status = status;
  }
}

class PlanningTransportError extends Error {
  constructor(operation) {
    super('Repository planning GitHub transport failed');
    this.name = 'PlanningTransportError';
    this.operation = operation;
  }
}

function planningFailure(error) {
  if (error instanceof PlanningStatusError) {
    throw new AxiomError(
      'repository_planner_api_error',
      'Repository planner GitHub request failed',
      error.status >= 500 ? 503 : 409,
      { operation: error.operation, status: error.status }
    );
  }
  if (error instanceof PlanningTransportError) {
    throw new AxiomError(
      'repository_planner_transport_error',
      'Repository planner GitHub transport failed',
      503,
      { operation: error.operation }
    );
  }
  throw error;
}

function normalizeFileResponse(value, name) {
  const file = assertPlainObject(value, name);
  if (file.type !== 'file' || file.encoding !== 'base64') {
    throw new ValidationError(`${name} is not a base64 file response`);
  }
  const blobSha = gitSha(file.sha, `${name}.sha`);
  const encoded = assertString(file.content, `${name}.content`, { max: MAX_API_RESPONSE_BYTES * 2 });
  const bytes = Buffer.from(encoded.replace(/\s/g, ''), 'base64');
  if (bytes.length > MAX_API_RESPONSE_BYTES) throw new ValidationError(`${name} content exceeds response ceiling`);
  const content = bytes.toString('utf8');
  if (!Buffer.from(content, 'utf8').equals(bytes)) throw new ValidationError(`${name} is not valid UTF-8 text`);
  return { sha: blobSha, content, content_sha256: sha256(content) };
}

function createReadOnlyGitHubClient({ token, origin, fetchImpl, timeoutMs = 10_000 }) {
  const secret = assertString(token, 'repository planner token', { min: 1, max: MAX_TOKEN_BYTES });
  if (/[\r\n\u0000]/.test(secret)) throw new ValidationError('repository planner token is invalid');
  const base = new URL(origin);

  async function get(operation, path, statuses = [200]) {
    const target = new URL(path, base);
    if (target.origin !== base.origin) throw new ValidationError('repository planner request escaped the fixed GitHub origin');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response;
      try {
        response = await fetchImpl(target, {
          method: 'GET',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${secret}`,
            'X-GitHub-Api-Version': REPOSITORY_OPERATOR_API_VERSION,
            'User-Agent': REPOSITORY_OPERATOR_USER_AGENT
          },
          signal: controller.signal,
          redirect: 'error'
        });
      } catch {
        throw new PlanningTransportError(operation);
      }
      if (!statuses.includes(response.status)) throw new PlanningStatusError(operation, response.status);
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_API_RESPONSE_BYTES) {
        throw new ValidationError('repository planner GitHub response exceeds size ceiling');
      }
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        throw new ValidationError('repository planner GitHub response is not valid JSON');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getBaseRef() {
      return get('planner_get_base_ref', `/repos/${OWNER}/${REPO}/git/ref/heads/main`);
    },
    async getFile(path, ref) {
      const route = `/repos/${OWNER}/${REPO}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`;
      try {
        return await get('planner_get_repository_file', route);
      } catch (error) {
        if (error instanceof PlanningStatusError && error.status === 404) return null;
        throw error;
      }
    }
  };
}

export async function planGitHubRepositoryDocsEffect({
  proposed_changes,
  operatorIdentity,
  token,
  origin = REPOSITORY_OPERATOR_API_ORIGIN,
  environment = process.env.NODE_ENV,
  fetchImpl = globalThis.fetch,
  now = new Date().toISOString(),
  expires_at,
  timeoutMs = 10_000
}) {
  if (!operatorIdentity?.keyId?.startsWith('repository-operator:') || typeof operatorIdentity.signObject !== 'function') {
    throw new ValidationError('repository planner requires repository-operator signing identity');
  }
  if (typeof fetchImpl !== 'function') throw new ValidationError('repository planner requires fetch implementation');

  // Validate caller-controlled data before even constructing an authenticated GitHub client.
  const proposals = normalizeRepositoryDocsProposedChanges(proposed_changes);
  const apiOrigin = resolveRepositoryOperatorOrigin({ origin, environment });
  const client = createReadOnlyGitHubClient({ token, origin: apiOrigin, fetchImpl, timeoutMs });

  try {
    const firstBase = assertPlainObject(await client.getBaseRef(), 'GitHub planning base ref');
    const baseSha = gitSha(firstBase.object?.sha, 'GitHub planning base SHA');
    const observedChanges = [];

    for (const proposal of proposals) {
      const remote = await client.getFile(proposal.path, baseSha);
      if (proposal.operation === 'create') {
        if (remote !== null) {
          throw new AxiomError(
            'repository_planner_create_conflict',
            'Proposed create path already exists at the observed base',
            409
          );
        }
        observedChanges.push({
          path: proposal.path,
          operation: 'create',
          new_content: proposal.new_content
        });
        continue;
      }
      if (remote === null) {
        throw new AxiomError(
          'repository_planner_update_missing',
          'Proposed update path does not exist at the observed base',
          409
        );
      }
      const file = normalizeFileResponse(remote, `planning file ${proposal.path}`);
      observedChanges.push({
        path: proposal.path,
        operation: 'update',
        old_blob_sha: file.sha,
        old_content_sha256: file.content_sha256,
        new_content: proposal.new_content
      });
    }

    const finalBase = assertPlainObject(await client.getBaseRef(), 'GitHub planning final base ref');
    const finalBaseSha = gitSha(finalBase.object?.sha, 'GitHub planning final base SHA');
    if (finalBaseSha !== baseSha) {
      throw new AxiomError(
        'repository_planner_base_race',
        'Repository main changed while the read-only plan was being observed',
        409
      );
    }

    const expiresAt = expires_at ?? new Date(new Date(now).valueOf() + 5 * 60_000).toISOString();
    return buildRepositoryDocsEffectPlan({
      identity: operatorIdentity,
      base_sha: baseSha,
      changes: observedChanges,
      planned_at: now,
      expires_at: expiresAt
    });
  } catch (error) {
    planningFailure(error);
  }
}
