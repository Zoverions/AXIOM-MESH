import { createPrivateKey } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ValidationError } from './canonical.mjs';
import { ReplayGuard } from './identity.mjs';
import { DataProtector } from './protector.mjs';
import { CircleReplica } from './circle-exchange.mjs';
import { circleKeyId } from './circle-keys.mjs';
import {
  circlePeerOrigin,
  createCircleSyncServer,
  httpCircleSender,
  syncCirclePeer
} from './circle-transport.mjs';

/**
 * A member's Circle node: one Circle replica held in encrypted local state,
 * served to other members over HTTPS and synced with configured peers
 * (circle-transport.mjs). Laboratory, off by default: nothing starts it, and
 * a configuration must say `enabled: true`.
 *
 * One process owns the state at a time (a lock beside the state file), so a
 * serving node and a one-shot sync cannot overwrite each other's updates.
 */

export const CIRCLE_PEER_CONFIG_SCHEMA = 'axiom-circle-peer-config.v0';
export const CIRCLE_PEER_STATE_SCHEMA = 'axiom-circle-peer-state.v0';
const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_STATE_BYTES = 64 * 1024 * 1024;
const MAX_PEERS = 16;
const REPLAY_CAPACITY = 10_000;
const pendingSaves = new WeakMap();
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const HOSTNAME = /^[A-Za-z0-9.:-]{1,253}$/;

export async function loadCirclePeerRuntime(configPath, { allowInsecureLoopback = false } = {}) {
  const path = absolutePath(configPath, 'Circle peer config path');
  let parsed;
  try {
    parsed = JSON.parse(await privateFile(path, MAX_CONFIG_BYTES, 'Circle peer config'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ValidationError('Circle peer config must contain valid JSON');
    throw error;
  }
  const config = normalizeConfig(parsed, { allowInsecureLoopback });
  let genesis;
  try {
    genesis = JSON.parse(await regularFile(config.genesis_file, MAX_CONFIG_BYTES, 'Circle genesis'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ValidationError('Circle genesis must contain valid JSON');
    throw error;
  }
  const genesisDigest = new CircleReplica({ genesis }).genesisDigest;
  let privateKey;
  try {
    privateKey = createPrivateKey(await privateFile(config.member.private_key_file, 8_192, 'Circle member key'));
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('Circle member key is invalid');
  }
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new ValidationError('Circle member key must use Ed25519');
  const stateKey = Buffer.from((await privateFile(config.state_key_file, 4_096, 'Circle peer state key')).trim(), 'base64url');
  if (stateKey.length !== 32) throw new ValidationError('Circle peer state key must contain 32 bytes');
  const tls = config.listen?.tls_key_file
    ? {
      key: await privateFile(config.listen.tls_key_file, 16_384, 'Circle peer TLS key'),
      cert: await regularFile(config.listen.tls_cert_file, 65_536, 'Circle peer TLS certificate')
    }
    : null;
  const peers = [];
  for (const peer of config.peers) {
    peers.push(Object.freeze({
      origin: peer.origin,
      servername: peer.server_name,
      ca: peer.ca_file ? await regularFile(peer.ca_file, 65_536, 'Circle peer CA') : undefined
    }));
  }
  return Object.freeze({
    config_path: path,
    config,
    genesis,
    genesis_digest: genesisDigest,
    principal_id: config.member.principal_id,
    key_id: circleKeyId(privateKey),
    private_key: privateKey,
    protector: new DataProtector(stateKey),
    tls,
    peers: Object.freeze(peers),
    allow_insecure_loopback: allowInsecureLoopback
  });
}

/** The replica from encrypted state, or a new one holding only the genesis. */
export async function openCirclePeerReplica(runtime) {
  const replica = new CircleReplica({ genesis: runtime.genesis });
  let serialized;
  try {
    const metadata = await stat(runtime.config.state_file);
    if (!metadata.isFile() || metadata.size > MAX_STATE_BYTES) {
      throw new ValidationError('Circle peer state must be a bounded regular file');
    }
    serialized = await readFile(runtime.config.state_file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return replica;
    throw error;
  }
  const state = runtime.protector.open(serialized.trim(), stateContext(runtime.genesis_digest));
  if (
    state?.schema !== CIRCLE_PEER_STATE_SCHEMA
    || state.genesis_digest !== runtime.genesis_digest
    || !Array.isArray(state.updates)
  ) throw new ValidationError('Circle peer state is invalid');
  // Every stored update is checked again as if it had just arrived.
  for (const update of state.updates) {
    const result = replica.receive(update);
    if (result.status === 'rejected') throw new ValidationError(`Circle peer state holds an invalid update: ${result.code}`);
  }
  return replica;
}

export function saveCirclePeerReplica(runtime, replica) {
  // Incoming offers and outbound syncs can save the same live replica at
  // once. Serialize the snapshots as well as the renames, so an older save
  // cannot replace a newer state file after the newer save has completed.
  const save = (pendingSaves.get(runtime) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const sealed = runtime.protector.seal({
      schema: CIRCLE_PEER_STATE_SCHEMA,
      genesis_digest: runtime.genesis_digest,
      updates: replica.exportUpdates()
    }, stateContext(runtime.genesis_digest));
    await atomicReplace(runtime.config.state_file, `${sealed}\n`, 0o600);
  });
  pendingSaves.set(runtime, save);
  return save;
}

/**
 * Syncs with every configured peer in turn, saving after each. A peer that
 * fails is reported and the others still run.
 */
export async function syncCirclePeers(runtime, replica, {
  senderFor = peer => httpCircleSender({ ...peer, allowInsecureLoopback: runtime.allow_insecure_loopback }),
  now = () => Date.now()
} = {}) {
  const results = [];
  for (const peer of runtime.peers) {
    try {
      const result = await syncCirclePeer({
        replica,
        principalId: runtime.principal_id,
        privateKey: runtime.private_key,
        send: senderFor(peer),
        now
      });
      results.push({ origin: peer.origin, status: 'synced', ...result });
    } catch (error) {
      if (!(error instanceof ValidationError) && !isNetworkError(error)) throw error;
      results.push({ origin: peer.origin, status: 'failed', code: error.code ?? 'error', message: error.message });
    } finally {
      // A pull may have accepted updates before a later round failed. Keep
      // that progress durable even when this peer is reported as failed.
      await saveCirclePeerReplica(runtime, replica);
    }
  }
  return results;
}

/** Runs one sync with every peer while holding the state lock. */
export async function runCirclePeerSync(runtime, options = {}) {
  const lock = await acquireStateLock(runtime.config.state_file);
  try {
    const replica = await openCirclePeerReplica(runtime);
    const peers = await syncCirclePeers(runtime, replica, options);
    return { genesis_digest: runtime.genesis_digest, peers, status: summarize(replica) };
  } finally {
    await lock.release();
  }
}

/**
 * Serves the Circle to other members and syncs with the configured peers
 * every `sync_interval_seconds`, holding the state lock until closed.
 */
export async function serveCirclePeer(runtime, { now = () => Date.now(), senderFor } = {}) {
  if (!runtime.config.listen) throw new ValidationError('Circle peer config has no listen section');
  const lock = await acquireStateLock(runtime.config.state_file);
  let server;
  let timer;
  try {
    const replica = await openCirclePeerReplica(runtime);
    server = createCircleSyncServer({
      replica,
      replayGuard: new ReplayGuard({ maxEntries: REPLAY_CAPACITY }),
      onChange: () => saveCirclePeerReplica(runtime, replica),
      tls: runtime.tls,
      allowInsecureLoopback: runtime.allow_insecure_loopback,
      now
    });
    await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(runtime.config.listen.port, runtime.config.listen.host, () => {
        server.off('error', rejectListen);
        resolveListen();
      });
    });
    let running = Promise.resolve();
    const syncOnce = () => {
      running = running.then(() => syncCirclePeers(runtime, replica, { now, ...(senderFor ? { senderFor } : {}) }));
      return running;
    };
    if (runtime.peers.length && runtime.config.sync_interval_seconds) {
      timer = setInterval(() => { syncOnce().catch(() => {}); }, runtime.config.sync_interval_seconds * 1000);
      timer.unref();
    }
    const address = server.address();
    return {
      replica,
      port: address.port,
      syncOnce,
      status: () => summarize(replica),
      close: async () => {
        clearInterval(timer);
        await new Promise(resolveClose => server.close(() => resolveClose()));
        await running.catch(() => {});
        await lock.release();
      }
    };
  } catch (error) {
    clearInterval(timer);
    server?.close();
    await lock.release();
    throw error;
  }
}

export async function circlePeerStatus(runtime) {
  return { genesis_digest: runtime.genesis_digest, status: summarize(await openCirclePeerReplica(runtime)) };
}

function summarize(replica) {
  const heads = replica.heads();
  return {
    updates: replica.size,
    pending: replica.pendingUpdates(),
    key_logs: heads.heads.length,
    equivocations: heads.equivocations.length
  };
}

function normalizeConfig(value, { allowInsecureLoopback }) {
  if (!isPlainObject(value) || value.schema !== CIRCLE_PEER_CONFIG_SCHEMA) {
    throw new ValidationError(`Circle peer config must use ${CIRCLE_PEER_CONFIG_SCHEMA}`);
  }
  allowedKeys(value, ['schema', 'enabled', 'genesis_file', 'member', 'state_file', 'state_key_file', 'listen', 'peers', 'sync_interval_seconds'], 'Circle peer config');
  // Off by default: a configuration must opt in explicitly.
  if (value.enabled !== true) {
    throw new ValidationError('Circle peer transport is disabled; set "enabled": true to run it');
  }
  if (!isPlainObject(value.member)) throw new ValidationError('Circle peer member is invalid');
  allowedKeys(value.member, ['principal_id', 'private_key_file'], 'Circle peer member');
  if (!IDENTIFIER.test(value.member.principal_id ?? '')) throw new ValidationError('Circle peer principal_id is invalid');
  let listen = null;
  if (value.listen !== undefined) {
    if (!isPlainObject(value.listen)) throw new ValidationError('Circle peer listen is invalid');
    allowedKeys(value.listen, ['host', 'port', 'tls_key_file', 'tls_cert_file'], 'Circle peer listen');
    if (!HOSTNAME.test(value.listen.host ?? '')) {
      throw new ValidationError('Circle peer listen host is invalid');
    }
    if (!Number.isSafeInteger(value.listen.port) || value.listen.port < 0 || value.listen.port > 65_535) {
      throw new ValidationError('Circle peer listen port is invalid');
    }
    const hasTls = value.listen.tls_key_file !== undefined || value.listen.tls_cert_file !== undefined;
    if (!hasTls && !allowInsecureLoopback) throw new ValidationError('Circle peer listen requires tls_key_file and tls_cert_file');
    listen = {
      host: value.listen.host,
      port: value.listen.port,
      ...(hasTls ? {
        tls_key_file: absolutePath(value.listen.tls_key_file, 'Circle peer tls_key_file'),
        tls_cert_file: absolutePath(value.listen.tls_cert_file, 'Circle peer tls_cert_file')
      } : {})
    };
  }
  if (!Array.isArray(value.peers) || value.peers.length > MAX_PEERS) {
    throw new ValidationError(`Circle peer peers must be a list of at most ${MAX_PEERS}`);
  }
  const peers = value.peers.map(peer => {
    if (!isPlainObject(peer)) throw new ValidationError('Circle peer entry is invalid');
    allowedKeys(peer, ['origin', 'ca_file', 'server_name'], 'Circle peer entry');
    circlePeerOrigin(peer.origin, { allowInsecureLoopback });
    if (peer.server_name !== undefined && !HOSTNAME.test(peer.server_name)) {
      throw new ValidationError('Circle peer server_name is invalid');
    }
    return {
      origin: peer.origin,
      ...(peer.ca_file !== undefined ? { ca_file: absolutePath(peer.ca_file, 'Circle peer ca_file') } : {}),
      ...(peer.server_name !== undefined ? { server_name: peer.server_name } : {})
    };
  });
  if (new Set(peers.map(peer => peer.origin)).size !== peers.length) {
    throw new ValidationError('Circle peer origins must be unique');
  }
  const interval = value.sync_interval_seconds ?? 300;
  if (!Number.isSafeInteger(interval) || interval < 30 || interval > 86_400) {
    throw new ValidationError('Circle peer sync_interval_seconds must be between 30 and 86400');
  }
  return Object.freeze({
    schema: CIRCLE_PEER_CONFIG_SCHEMA,
    enabled: true,
    genesis_file: absolutePath(value.genesis_file, 'Circle peer genesis_file'),
    member: {
      principal_id: value.member.principal_id,
      private_key_file: absolutePath(value.member.private_key_file, 'Circle peer private_key_file')
    },
    state_file: absolutePath(value.state_file, 'Circle peer state_file'),
    state_key_file: absolutePath(value.state_key_file, 'Circle peer state_key_file'),
    listen,
    peers,
    sync_interval_seconds: interval
  });
}

async function acquireStateLock(stateFile) {
  const path = `${stateFile}.lock`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, token: randomUUID() }));
      await handle.close();
      let released = false;
      return {
        release: async () => {
          if (released) return;
          released = true;
          await rm(path, { force: true });
        }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let owner;
      try {
        owner = JSON.parse(await readFile(path, 'utf8'));
      } catch {
        owner = null;
      }
      if (attempt === 0 && owner && !processIsActive(owner.pid)) {
        await rm(path, { force: true });
        continue;
      }
      throw new ValidationError('Circle peer state is in use by another process');
    }
  }
  throw new ValidationError('Circle peer state is in use by another process');
}

function processIsActive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function isNetworkError(error) {
  return typeof error?.code === 'string' && /^(E[A-Z]+|ERR_[A-Z_]+|UNABLE_TO_|DEPTH_ZERO|SELF_SIGNED|CERT_)/.test(error.code);
}

function stateContext(genesisDigest) {
  return `axiom:circle-peer-state:${genesisDigest}`;
}

async function privateFile(path, maximumBytes, label) {
  return regularFile(path, maximumBytes, label, { requirePrivate: true });
}

async function regularFile(path, maximumBytes, label, { requirePrivate = false } = {}) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new ValidationError(`${label} must be a bounded regular file`);
  }
  if (requirePrivate && process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
    throw new ValidationError(`${label} must not be accessible by group or others`);
  }
  return readFile(path, 'utf8');
}

async function atomicReplace(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { mode, flag: 'wx' });
  await rename(temporary, path);
}

function absolutePath(value, name) {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new ValidationError(`${name} must be an absolute path`);
  return resolve(value);
}

function allowedKeys(value, keys, label) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new ValidationError(`${label} has an unknown field: ${key}`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
