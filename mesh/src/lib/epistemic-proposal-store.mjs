import { lstat, open, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { ValidationError, canonicalJson, canonicalize } from './canonical.mjs';
import { validateEpistemicProposal } from './epistemic-contracts.mjs';

export const EPISTEMIC_PROPOSAL_STORE_FILENAME = 'epistemic-proposals.v0.jsonl';
export const EPISTEMIC_PROPOSAL_STORE_STATUS = 'local-disposable-e1';
export const EPISTEMIC_PROPOSAL_STORE_LIMITS = Object.freeze({
  object_count: 1024,
  export_bytes: 8 * 1024 * 1024,
  graph_depth: 8
});

const STORE_OPTIONS = new Set(['directory', 'disposable']);

function fail(message) {
  throw new ValidationError(message);
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function validateOpenOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    fail('an explicit disposable proposal-store directory is required');
  }
  for (const key of Object.keys(options)) {
    if (!STORE_OPTIONS.has(key)) fail(`proposal-store option ${key} is unsupported`);
  }
  if (typeof options.directory !== 'string' || options.directory.length === 0) {
    fail('proposal-store directory is required');
  }
  if (!isAbsolute(options.directory)) fail('proposal-store directory must be absolute');
  if (options.disposable !== true) fail('proposal-store directory must be explicitly disposable');
  return options.directory;
}

async function requireRealDirectory(directory) {
  let stat;
  try {
    stat = await lstat(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') fail('proposal-store directory must already exist');
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('proposal-store directory must be a real non-symlink directory');
  }
}

async function inspectStatePath(statePath) {
  try {
    const stat = await lstat(statePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      fail('proposal-store state path must be a regular non-symlink file');
    }
    return stat;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function clone(value) {
  return canonicalize(value);
}

function applyRevision(heads, history, proposal, { replay = false } = {}) {
  const current = heads.get(proposal.id);
  if (!current) {
    if (proposal.revision !== 1) fail(`new proposal ${proposal.id} must begin at revision 1`);
    if (heads.size >= EPISTEMIC_PROPOSAL_STORE_LIMITS.object_count) {
      fail(`proposal-store object count exceeds ${EPISTEMIC_PROPOSAL_STORE_LIMITS.object_count}`);
    }
    heads.set(proposal.id, proposal);
    history.push(proposal);
    return 'appended';
  }

  if (proposal.revision === current.revision) {
    if (proposal.content_digest !== current.content_digest) {
      fail(`proposal ${proposal.id} revision ${proposal.revision} conflicts with retained revision`);
    }
    if (replay) return 'idempotent';
    return 'idempotent';
  }

  if (proposal.revision !== current.revision + 1) {
    fail(`proposal ${proposal.id} revision is stale or skips the retained head`);
  }
  if (proposal.previous_revision !== current.content_digest) {
    fail(`proposal ${proposal.id} previous_revision does not match retained head`);
  }

  heads.set(proposal.id, proposal);
  history.push(proposal);
  return 'appended';
}

function assertGraphBounds(heads) {
  const visiting = new Set();
  const depths = new Map();

  function depthFor(id) {
    if (depths.has(id)) return depths.get(id);
    if (visiting.has(id)) fail(`proposal provenance graph contains a cycle at ${id}`);
    visiting.add(id);

    const proposal = heads.get(id);
    let depth = 0;
    for (const reference of proposal.provenance_refs) {
      if (!heads.has(reference)) continue;
      const candidateDepth = depthFor(reference) + 1;
      if (candidateDepth > depth) depth = candidateDepth;
      if (depth > EPISTEMIC_PROPOSAL_STORE_LIMITS.graph_depth) {
        fail(`proposal provenance graph exceeds depth ${EPISTEMIC_PROPOSAL_STORE_LIMITS.graph_depth}`);
      }
    }

    visiting.delete(id);
    depths.set(id, depth);
    return depth;
  }

  for (const id of heads.keys()) depthFor(id);
}

function parseStateBytes(bytes) {
  if (bytes.length === 0) return [];
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n')) fail('proposal-store state is truncated');

  const records = [];
  const lines = text.slice(0, -1).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (raw.length === 0) fail(`proposal-store state contains an empty record at line ${index + 1}`);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      fail(`proposal-store state contains invalid JSON at line ${index + 1}`);
    }
    if (canonicalJson(parsed) !== raw) {
      fail(`proposal-store state contains non-canonical JSON at line ${index + 1}`);
    }
    records.push(validateEpistemicProposal(parsed));
  }
  return records;
}

function replayState(records) {
  const heads = new Map();
  const history = [];
  for (const proposal of records) {
    applyRevision(heads, history, proposal, { replay: true });
    assertGraphBounds(heads);
  }
  return { heads, history };
}

async function appendDurably(statePath, proposal) {
  await inspectStatePath(statePath);
  const line = `${canonicalJson(proposal)}\n`;
  const handle = await open(statePath, 'a', 0o600);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) fail('proposal-store state path is not a regular file');
    await handle.write(line, null, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

class EpistemicProposalStore {
  #statePath;
  #heads;
  #history;
  #tail = Promise.resolve();

  constructor(directory, statePath, heads, history) {
    this.directory = directory;
    this.canonical_state = 'proposal';
    this.authority_effect = 'none';
    this.#statePath = statePath;
    this.#heads = heads;
    this.#history = history;
  }

  #enqueue(operation) {
    const result = this.#tail.then(operation);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async put(value) {
    return this.#enqueue(async () => {
      const proposal = validateEpistemicProposal(value);
      const current = this.#heads.get(proposal.id);

      if (current && proposal.revision === current.revision && proposal.content_digest === current.content_digest) {
        return clone(current);
      }

      const prospectiveHeads = new Map(this.#heads);
      const prospectiveHistory = [...this.#history];
      applyRevision(prospectiveHeads, prospectiveHistory, proposal);
      assertGraphBounds(prospectiveHeads);

      await requireRealDirectory(this.directory);
      await appendDurably(this.#statePath, proposal);
      this.#heads = prospectiveHeads;
      this.#history = prospectiveHistory;
      return clone(proposal);
    });
  }

  async getHead(id) {
    await this.#tail;
    if (typeof id !== 'string' || id.length < 1 || id.length > 256) fail('proposal id must contain 1-256 characters');
    const proposal = this.#heads.get(id);
    return proposal ? clone(proposal) : null;
  }

  async exportSnapshot() {
    await this.#tail;
    const records = [...this.#history]
      .sort((left, right) => compareCodeUnits(left.id, right.id) || left.revision - right.revision)
      .map(clone);
    const snapshot = {
      schema: 'axiom-epistemic-proposal-snapshot.v0',
      canonical_state: 'proposal',
      authority_effect: 'none',
      record_count: records.length,
      records
    };
    const output = `${canonicalJson(snapshot)}\n`;
    const bytes = Buffer.byteLength(output, 'utf8');
    if (bytes > EPISTEMIC_PROPOSAL_STORE_LIMITS.export_bytes) {
      fail(`proposal-store deterministic export exceeds 8 MiB (${EPISTEMIC_PROPOSAL_STORE_LIMITS.export_bytes} bytes)`);
    }
    return output;
  }
}

export async function openEpistemicProposalStore(options) {
  const directory = validateOpenOptions(options);
  await requireRealDirectory(directory);
  const statePath = join(directory, EPISTEMIC_PROPOSAL_STORE_FILENAME);
  const stat = await inspectStatePath(statePath);
  const bytes = stat ? await readFile(statePath) : Buffer.alloc(0);
  const records = parseStateBytes(bytes);
  const { heads, history } = replayState(records);
  return new EpistemicProposalStore(directory, statePath, heads, history);
}
