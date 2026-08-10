import { readFile, stat } from 'node:fs/promises';
import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from '../lib/canonical.mjs';
import { verifyObjectSignature } from '../lib/identity.mjs';
import {
  REPOSITORY_DOCS_EFFECT_POLICY,
  buildRepositoryDocsEffectReceipt,
  repositoryDocsEffectBranch,
  verifyPreparedRepositoryDocsEffect
} from '../lib/repository-docs-effect.mjs';

export const REPOSITORY_OPERATOR_API_ORIGIN = 'https://api.github.com';
export const REPOSITORY_OPERATOR_API_VERSION = '2026-03-10';
export const REPOSITORY_OPERATOR_USER_AGENT = 'AXIOM-MESH-repository-operator/1.0';
export const REPOSITORY_OPERATOR_RESULT_SCHEMA = 'axiom-repository-docs-operator-result.v1';

const OWNER = 'Zoverions';
const REPO = 'AXIOM-MESH';
const MAX_TOKEN_BYTES = 4096;
const MAX_API_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 30_000;
const GRID_PREPARED_KIND = 'external.effect.prepared';
const DIGEST = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function gitSha(value, name) {
  return assertString(value, name, { min: 40, max: 40, pattern: GIT_SHA });
}

function safeDate(value, name) {
  const text = assertString(value, name, { max: 64 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return parsed;
}

function encodePath(path) {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

export function resolveRepositoryOperatorOrigin({
  origin = REPOSITORY_OPERATOR_API_ORIGIN,
  environment = process.env.NODE_ENV
} = {}) {
  const parsed = new URL(origin);
  if (origin === REPOSITORY_OPERATOR_API_ORIGIN) return parsed.origin;
  if (environment !== 'test' || !isLoopbackHost(parsed.hostname) || !['http:', 'https:'].includes(parsed.protocol)) {
    throw new ValidationError('repository operator API origin override is permitted only for loopback tests');
  }
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new ValidationError('repository operator test origin must be a bare loopback origin');
  }
  return parsed.origin;
}

export async function readRepositoryOperatorToken(tokenFile) {
  const path = assertString(tokenFile, 'repository operator token file', { min: 1, max: 4096 });
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new ValidationError('repository operator token path must be a regular file');
  if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
    throw new ValidationError('repository operator token file must not be group/world accessible');
  }
  if (metadata.size <= 0 || metadata.size > MAX_TOKEN_BYTES) {
    throw new ValidationError('repository operator token file size is invalid');
  }
  const token = (await readFile(path, 'utf8')).trim();
  if (!token || Buffer.byteLength(token, 'utf8') > MAX_TOKEN_BYTES || /[\r\n\u0000]/.test(token)) {
    throw new ValidationError('repository operator token file content is invalid');
  }
  return token;
}

export function verifyDurableGridPreparation({
  prepared_effect,
  grid_prepared_event,
  hypervisorPublicKey,
  operatorPublicKey,
  gridPublicKey,
  now = new Date().toISOString()
}) {
  const prepared = verifyPreparedRepositoryDocsEffect(prepared_effect, {
    hypervisorPublicKey,
    operatorPublicKey,
    now
  });
  const event = assertPlainObject(grid_prepared_event, 'Grid prepared-event evidence');
  if (!Number.isSafeInteger(event.seq) || event.seq <= 0) {
    throw new ValidationError('Grid prepared-event sequence must be positive');
  }
  const eventId = assertString(event.event_id, 'Grid prepared-event event_id', { max: 192, pattern: ID });
  const traceId = assertString(event.trace_id, 'Grid prepared-event trace_id', { max: 160, pattern: ID });
  const actor = assertString(event.actor, 'Grid prepared-event actor', { max: 160, pattern: ID });
  if (event.kind !== GRID_PREPARED_KIND) throw new ValidationError('Grid evidence is not an external-effect preparation event');
  if (event.subject !== prepared.effect_id) throw new ValidationError('Grid prepared-event subject does not match the prepared effect');
  if (actor !== prepared.source_bindings.principal) throw new ValidationError('Grid prepared-event actor does not match the prepared effect principal');
  const occurredAt = safeDate(event.occurred_at, 'Grid prepared-event occurred_at');
  const preparedAt = safeDate(prepared.prepared_at, 'prepared_effect.prepared_at');
  const expiresAt = safeDate(prepared.expires_at, 'prepared_effect.expires_at');
  const current = safeDate(now, 'current time');
  if (occurredAt.valueOf() < preparedAt.valueOf() || occurredAt.valueOf() > expiresAt.valueOf()) {
    throw new ValidationError('Grid prepared-event timestamp is outside the prepared-effect lifetime');
  }
  if (occurredAt.valueOf() > current.valueOf() + MAX_CLOCK_SKEW_MS) {
    throw new ValidationError('Grid prepared-event timestamp is in the future');
  }
  const expectedPayloadDigest = digestObject({ prepared_effect: prepared });
  if (digest(event.payload_digest, 'Grid prepared-event payload_digest') !== expectedPayloadDigest) {
    throw new ValidationError('Grid prepared-event payload digest does not bind the prepared effect');
  }
  const prevHash = digest(event.prev_hash, 'Grid prepared-event prev_hash');
  const eventHash = digest(event.event_hash, 'Grid prepared-event event_hash');
  const envelope = {
    seq: event.seq,
    event_id: eventId,
    trace_id: traceId,
    actor,
    kind: GRID_PREPARED_KIND,
    subject: prepared.effect_id,
    occurred_at: occurredAt.toISOString(),
    payload_digest: expectedPayloadDigest,
    prev_hash: prevHash
  };
  if (digestObject(envelope) !== eventHash) throw new ValidationError('Grid prepared-event hash is invalid');
  const signature = assertPlainObject(event.signature, 'Grid prepared-event signature');
  if (
    signature.algorithm !== 'Ed25519'
    || typeof signature.key_id !== 'string'
    || !signature.key_id.startsWith('grid:')
    || !verifyObjectSignature({ event_hash: eventHash }, signature, gridPublicKey)
  ) {
    throw new ValidationError('Grid prepared-event signature is invalid');
  }
  return {
    prepared_effect: prepared,
    grid_event: {
      ...envelope,
      event_hash: eventHash,
      signature: JSON.parse(canonicalJson(signature))
    }
  };
}

class GitHubStatusError extends Error {
  constructor(operation, status) {
    super('Repository operator GitHub request failed');
    this.name = 'GitHubStatusError';
    this.operation = operation;
    this.status = status;
  }
}

class GitHubTransportError extends Error {
  constructor(operation) {
    super('Repository operator GitHub transport failed');
    this.name = 'GitHubTransportError';
    this.operation = operation;
  }
}

function apiFailure(error) {
  if (error instanceof GitHubStatusError) {
    throw new AxiomError(
      'repository_operator_api_error',
      'Repository operator GitHub request failed',
      error.status >= 500 ? 503 : 409,
      { operation: error.operation, status: error.status }
    );
  }
  if (error instanceof GitHubTransportError) {
    throw new AxiomError(
      'repository_operator_transport_error',
      'Repository operator GitHub transport failed',
      503,
      { operation: error.operation }
    );
  }
  throw error;
}

function normalizeFileResponse(value, name) {
  const file = assertPlainObject(value, name);
  if (file.type !== 'file' || file.encoding !== 'base64') throw new ValidationError(`${name} is not a base64 file response`);
  const blobSha = gitSha(file.sha, `${name}.sha`);
  const encoded = assertString(file.content, `${name}.content`, { max: MAX_API_RESPONSE_BYTES * 2 });
  let bytes;
  try {
    bytes = Buffer.from(encoded.replace(/\s/g, ''), 'base64');
  } catch {
    throw new ValidationError(`${name} base64 content is invalid`);
  }
  if (bytes.length > MAX_API_RESPONSE_BYTES) throw new ValidationError(`${name} content exceeds response ceiling`);
  const content = bytes.toString('utf8');
  if (!Buffer.from(content, 'utf8').equals(bytes)) throw new ValidationError(`${name} is not valid UTF-8 text`);
  return { sha: blobSha, content, content_sha256: sha256(content) };
}

function plannedChangeMap(prepared) {
  return new Map(prepared.plan.changes.map(change => [change.path, change]));
}

function deterministicPullRequest(prepared) {
  return {
    title: `AXIOM Intent docs effect ${prepared.effect_digest.slice(0, 12)}`,
    body: [
      'Prepared by AXIOM Intent repository operator.',
      '',
      `Effect: ${prepared.effect_id}`,
      `Plan: ${prepared.plan.plan_id}`,
      '',
      'This pull request is draft-only and carries no merge authority.'
    ].join('\n')
  };
}

function validatePullRequest(raw, prepared, branch) {
  const pr = assertPlainObject(raw, 'GitHub pull request');
  if (!Number.isSafeInteger(pr.number) || pr.number <= 0) throw new ValidationError('GitHub pull request number is invalid');
  if (pr.state !== 'open' || pr.draft !== true) throw new ValidationError('repository operator requires an open draft pull request');
  if (pr.base?.ref !== REPOSITORY_DOCS_EFFECT_POLICY.base_branch || pr.head?.ref !== branch) {
    throw new ValidationError('GitHub pull request base/head does not match the prepared effect');
  }
  const expected = deterministicPullRequest(prepared);
  if (pr.title !== expected.title || pr.body !== expected.body) {
    throw new ValidationError('GitHub pull request metadata does not match the prepared effect');
  }
  return pr;
}

function validateCompare(raw, prepared, { requireExact = false } = {}) {
  const comparison = assertPlainObject(raw, 'GitHub compare response');
  if (comparison.merge_base_commit?.sha !== prepared.plan.base_sha) {
    throw new ValidationError('repository operator branch is not based on the prepared base SHA');
  }
  const planned = plannedChangeMap(prepared);
  const files = comparison.files ?? [];
  if (!Array.isArray(files)) throw new ValidationError('GitHub compare files are invalid');
  const seen = new Set();
  for (const item of files) {
    const file = assertPlainObject(item, 'GitHub compare file');
    const filename = assertString(file.filename, 'GitHub compare filename', { max: 240 });
    const change = planned.get(filename);
    if (!change) throw new ValidationError('repository operator branch contains an unplanned changed path');
    if (!['added', 'modified'].includes(file.status) || file.previous_filename !== undefined) {
      throw new ValidationError('repository operator branch contains a prohibited file transition');
    }
    if (change.operation === 'create' && file.status !== 'added') {
      throw new ValidationError('repository operator create plan does not match branch diff');
    }
    if (change.operation === 'update' && file.status !== 'modified') {
      throw new ValidationError('repository operator update plan does not match branch diff');
    }
    if (seen.has(filename)) throw new ValidationError('GitHub compare response contains duplicate paths');
    seen.add(filename);
  }
  if (requireExact && seen.size !== planned.size) {
    throw new ValidationError('repository operator branch does not contain the complete planned change set');
  }
  return comparison;
}

function createGitHubClient({ token, origin, fetchImpl, timeoutMs = 10_000 }) {
  const secret = assertString(token, 'repository operator token', { min: 1, max: MAX_TOKEN_BYTES });
  if (/[\r\n\u0000]/.test(secret)) throw new ValidationError('repository operator token is invalid');
  const base = new URL(origin);

  async function request(operation, method, path, { body, statuses = [200] } = {}) {
    const target = new URL(path, base);
    if (target.origin !== base.origin) throw new ValidationError('repository operator request escaped the fixed GitHub origin');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response;
      try {
        response = await fetchImpl(target, {
          method,
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${secret}`,
            'X-GitHub-Api-Version': REPOSITORY_OPERATOR_API_VERSION,
            'User-Agent': REPOSITORY_OPERATOR_USER_AGENT,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: controller.signal,
          redirect: 'error'
        });
      } catch {
        throw new GitHubTransportError(operation);
      }
      if (!statuses.includes(response.status)) throw new GitHubStatusError(operation, response.status);
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_API_RESPONSE_BYTES) {
        throw new ValidationError('repository operator GitHub response exceeds size ceiling');
      }
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        throw new ValidationError('repository operator GitHub response is not valid JSON');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getBaseRef() {
      return request('get_base_ref', 'GET', `/repos/${OWNER}/${REPO}/git/ref/heads/main`);
    },
    async getBranchRef(branch) {
      try {
        return await request('get_effect_branch_ref', 'GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${encodePath(branch)}`);
      } catch (error) {
        if (error instanceof GitHubStatusError && error.status === 404) return null;
        throw error;
      }
    },
    async createBranch(branch, sha) {
      return request('create_effect_branch', 'POST', `/repos/${OWNER}/${REPO}/git/refs`, {
        statuses: [201],
        body: { ref: `refs/heads/${branch}`, sha }
      });
    },
    async getFile(path, ref) {
      const route = `/repos/${OWNER}/${REPO}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`;
      try {
        return await request('get_repository_file', 'GET', route);
      } catch (error) {
        if (error instanceof GitHubStatusError && error.status === 404) return null;
        throw error;
      }
    },
    async putFile(path, { content, branch, message, sha }) {
      return request('put_repository_file', 'PUT', `/repos/${OWNER}/${REPO}/contents/${encodePath(path)}`, {
        statuses: [200, 201],
        body: {
          message,
          content: Buffer.from(content, 'utf8').toString('base64'),
          branch,
          ...(sha ? { sha } : {})
        }
      });
    },
    async compare(baseSha, branch) {
      return request(
        'compare_effect_branch',
        'GET',
        `/repos/${OWNER}/${REPO}/compare/${encodeURIComponent(`${baseSha}...${branch}`)}?per_page=100&page=1`
      );
    },
    async listPullRequests(branch) {
      const query = new URLSearchParams({
        state: 'open',
        head: `${OWNER}:${branch}`,
        base: REPOSITORY_DOCS_EFFECT_POLICY.base_branch,
        per_page: '10'
      });
      return request('list_effect_pull_requests', 'GET', `/repos/${OWNER}/${REPO}/pulls?${query}`);
    },
    async createPullRequest(prepared, branch) {
      const metadata = deterministicPullRequest(prepared);
      return request('create_effect_pull_request', 'POST', `/repos/${OWNER}/${REPO}/pulls`, {
        statuses: [201],
        body: {
          ...metadata,
          head: branch,
          base: REPOSITORY_DOCS_EFFECT_POLICY.base_branch,
          draft: true
        }
      });
    },
    async getPullRequest(number) {
      return request('get_effect_pull_request', 'GET', `/repos/${OWNER}/${REPO}/pulls/${number}`);
    }
  };
}

async function verifyBasePlan(client, prepared) {
  const baseRef = assertPlainObject(await client.getBaseRef(), 'GitHub base ref');
  const baseSha = gitSha(baseRef.object?.sha, 'GitHub base ref SHA');
  if (baseSha !== prepared.plan.base_sha) throw new AxiomError('repository_operator_stale_base', 'Repository base SHA changed before the prepared effect could run', 409);
  for (const change of prepared.plan.changes) {
    const remote = await client.getFile(change.path, prepared.plan.base_sha);
    if (change.operation === 'create') {
      if (remote !== null) throw new AxiomError('repository_operator_create_conflict', 'Prepared create path already exists at the base SHA', 409);
      continue;
    }
    if (remote === null) throw new AxiomError('repository_operator_update_missing', 'Prepared update path is missing at the base SHA', 409);
    const file = normalizeFileResponse(remote, `base file ${change.path}`);
    if (file.sha !== change.old_blob_sha || file.content_sha256 !== change.old_content_sha256) {
      throw new AxiomError('repository_operator_base_content_drift', 'Prepared update no longer matches the observed base content', 409);
    }
  }
}

async function ensureEffectBranch(client, prepared, branch) {
  let ref = await client.getBranchRef(branch);
  if (!ref) {
    try {
      ref = await client.createBranch(branch, prepared.plan.base_sha);
    } catch (error) {
      if (!(error instanceof GitHubStatusError) && !(error instanceof GitHubTransportError)) throw error;
      ref = await client.getBranchRef(branch);
      if (!ref) throw error;
    }
  }
  gitSha(ref.object?.sha, 'effect branch SHA');
  validateCompare(await client.compare(prepared.plan.base_sha, branch), prepared);
  return ref;
}

async function readBranchFile(client, change, branch) {
  const remote = await client.getFile(change.path, branch);
  if (remote === null) return null;
  return normalizeFileResponse(remote, `effect branch file ${change.path}`);
}

async function applyChange(client, prepared, change, branch) {
  const current = await readBranchFile(client, change, branch);
  if (current?.content_sha256 === change.new_content_sha256) {
    return { changed: false, observed_blob_sha: current.sha };
  }
  let compareAndSwapSha;
  if (change.operation === 'create') {
    if (current !== null) throw new AxiomError('repository_operator_branch_conflict', 'Effect branch contains incompatible content at a create path', 409);
  } else {
    if (
      current === null
      || current.sha !== change.old_blob_sha
      || current.content_sha256 !== change.old_content_sha256
    ) {
      throw new AxiomError('repository_operator_branch_conflict', 'Effect branch contains incompatible content at an update path', 409);
    }
    compareAndSwapSha = current.sha;
  }
  const message = `AXIOM Intent docs ${prepared.effect_digest.slice(0, 12)}: ${change.path}`;
  try {
    await client.putFile(change.path, {
      content: change.new_content,
      branch,
      message,
      sha: compareAndSwapSha
    });
  } catch (error) {
    if (!(error instanceof GitHubStatusError) && !(error instanceof GitHubTransportError)) throw error;
    const observed = await readBranchFile(client, change, branch);
    if (observed?.content_sha256 === change.new_content_sha256) {
      return { changed: true, observed_blob_sha: observed.sha, ambiguous_recovered: true };
    }
    throw error;
  }
  const observed = await readBranchFile(client, change, branch);
  if (observed?.content_sha256 !== change.new_content_sha256) {
    throw new AxiomError('repository_operator_post_write_mismatch', 'Repository file did not match the prepared content after write', 503);
  }
  return { changed: true, observed_blob_sha: observed.sha, ambiguous_recovered: false };
}

async function ensurePullRequest(client, prepared, branch) {
  const listed = await client.listPullRequests(branch);
  if (!Array.isArray(listed)) throw new ValidationError('GitHub pull request list response is invalid');
  if (listed.length > 1) throw new AxiomError('repository_operator_pr_conflict', 'Multiple pull requests exist for the deterministic effect branch', 409);
  if (listed.length === 1) return { pr: validatePullRequest(listed[0], prepared, branch), created: false };
  try {
    return { pr: validatePullRequest(await client.createPullRequest(prepared, branch), prepared, branch), created: true };
  } catch (error) {
    if (!(error instanceof GitHubStatusError) && !(error instanceof GitHubTransportError)) throw error;
    const recovered = await client.listPullRequests(branch);
    if (!Array.isArray(recovered) || recovered.length !== 1) throw error;
    return { pr: validatePullRequest(recovered[0], prepared, branch), created: true, ambiguous_recovered: true };
  }
}

async function verifyFinalState(client, prepared, branch, prNumber) {
  const branchRef = assertPlainObject(await client.getBranchRef(branch), 'GitHub effect branch ref');
  const headSha = gitSha(branchRef.object?.sha, 'GitHub effect branch head SHA');
  validateCompare(await client.compare(prepared.plan.base_sha, branch), prepared, { requireExact: true });
  const appliedFiles = [];
  for (const change of prepared.plan.changes) {
    const file = await readBranchFile(client, change, branch);
    if (!file || file.content_sha256 !== change.new_content_sha256) {
      throw new AxiomError('repository_operator_final_state_mismatch', 'Effect branch file does not match the prepared content', 503);
    }
    appliedFiles.push({
      path: change.path,
      new_content_sha256: change.new_content_sha256,
      observed_blob_sha: file.sha
    });
  }
  const pr = validatePullRequest(await client.getPullRequest(prNumber), prepared, branch);
  if (pr.head?.sha && pr.head.sha !== headSha) {
    throw new ValidationError('GitHub pull request head SHA does not match the verified effect branch');
  }
  return { headSha, appliedFiles, pr };
}

export async function runGitHubRepositoryDocsOperator({
  prepared_effect,
  grid_prepared_event,
  operatorIdentity,
  hypervisorPublicKey,
  gridPublicKey,
  token,
  origin,
  environment = process.env.NODE_ENV,
  fetchImpl = globalThis.fetch,
  now = new Date().toISOString(),
  timeoutMs = 10_000
}) {
  if (!operatorIdentity?.keyId?.startsWith('repository-operator:') || typeof operatorIdentity.signObject !== 'function') {
    throw new ValidationError('repository operator requires repository-operator signing identity');
  }
  if (typeof fetchImpl !== 'function') throw new ValidationError('repository operator requires fetch implementation');

  // This proof is intentionally completed before token validation/client creation so invalid
  // durability evidence can be shown to result in zero GitHub calls.
  const durable = verifyDurableGridPreparation({
    prepared_effect,
    grid_prepared_event,
    hypervisorPublicKey,
    operatorPublicKey: operatorIdentity.publicKey,
    gridPublicKey,
    now
  });
  const prepared = durable.prepared_effect;
  const apiOrigin = resolveRepositoryOperatorOrigin({ origin, environment });
  const client = createGitHubClient({ token, origin: apiOrigin, fetchImpl, timeoutMs });
  const branch = repositoryDocsEffectBranch(prepared.effect_digest);
  let mutationCount = 0;
  let ambiguousRecoveries = 0;

  try {
    await verifyBasePlan(client, prepared);
    await ensureEffectBranch(client, prepared, branch);
    for (const change of prepared.plan.changes) {
      const applied = await applyChange(client, prepared, change, branch);
      if (applied.changed) mutationCount += 1;
      if (applied.ambiguous_recovered) ambiguousRecoveries += 1;
    }
    const prState = await ensurePullRequest(client, prepared, branch);
    if (prState.created) mutationCount += 1;
    if (prState.ambiguous_recovered) ambiguousRecoveries += 1;
    const final = await verifyFinalState(client, prepared, branch, prState.pr.number);
    const receipt = buildRepositoryDocsEffectReceipt({
      identity: operatorIdentity,
      prepared_effect: prepared,
      hypervisorPublicKey,
      operatorPublicKey: operatorIdentity.publicKey,
      head_sha: final.headSha,
      pull_request_number: final.pr.number,
      pull_request_id: `github-pr:${final.pr.number}`,
      applied_files: final.appliedFiles,
      observed_at: now,
      already_applied: mutationCount === 0
    });
    return {
      schema: REPOSITORY_OPERATOR_RESULT_SCHEMA,
      effect_id: prepared.effect_id,
      effect_digest: prepared.effect_digest,
      grid_prepared_event_id: durable.grid_event.event_id,
      grid_prepared_event_hash: durable.grid_event.event_hash,
      branch,
      pull_request_number: final.pr.number,
      mutation_count: mutationCount,
      ambiguous_recoveries: ambiguousRecoveries,
      receipt,
      merge_performed: false,
      base_branch_content_changed: false,
      execution_authorized: false,
      remediation_converged: false
    };
  } catch (error) {
    apiFailure(error);
  }
}
