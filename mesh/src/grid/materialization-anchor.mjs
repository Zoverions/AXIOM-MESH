/**
 * Materialization anchors (scalability audit S-01). BUILT, NOT ENABLED.
 *
 * Disabled unless AXIOM_GRID_MATERIALIZATION_ANCHORS=1. When disabled the
 * Grid behaves exactly as before: every start replays the full log, so any
 * edit to a materialized table -- at rest or during a session -- is undone by
 * a restart.
 *
 * Enabling anchors trades part of that guarantee for startup cost. It still
 * detects edits made at rest (signed digest) and edits made during a session
 * by any other database connection (SQLite data_version). It does not undo
 * edits made during a session through the Grid's own connection. Such a
 * writer runs inside the Grid process, which holds the signing key and could
 * already forge events, but the change is to a guarantee the kernel tests pin
 * down, so turning it on is an operator and maintainer decision.
 *
 * Grid materialized tables are a deterministic function of the signed event
 * log: every write to them happens in applyMaterializedEvent, inside the same
 * transaction that appends the event. Startup nevertheless replayed the whole
 * log, so restart cost grew with total history.
 *
 * An anchor records, per materialization layer, the exact state the tables
 * were in at a clean shutdown:
 *
 *   - the layer fingerprint (layer version, kernel version, schema version);
 *   - the last event sequence and hash the state reflects;
 *   - a digest of every row in the layer's tables.
 *
 * The anchor is signed with the Grid identity. At startup the layer skips
 * replay only if the signature verifies, the fingerprint and chain position
 * match, and the tables still hash to the recorded digest. Anything else --
 * missing, malformed, unsigned, stale, upgraded, or tampered -- falls back to
 * the full deterministic replay, exactly as before.
 *
 * The signature matters: full replay used to heal any edit made to a
 * materialized table at rest. An unsigned digest could simply be recomputed by
 * whoever made the edit; a signed one cannot be forged without the Grid key,
 * which would already permit forging events.
 *
 * Anchors bind the chain position, so any append makes them stale. A crash
 * therefore always leads to full replay; only a clean close records a fresh
 * anchor.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalJson, sha256 } from '../lib/canonical.mjs';
import { verifyObjectSignature } from '../lib/identity.mjs';

export const MATERIALIZATION_ANCHOR_FORMAT = 'axiom-materialization-anchor.v1';

const KERNEL_VERSION = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).version;

/** Set AXIOM_GRID_MATERIALIZATION_ANCHORS=1 to let startup trust anchored state. */
export function anchorsEnabled(env = process.env) {
  return env.AXIOM_GRID_MATERIALIZATION_ANCHORS === '1';
}

/** Set AXIOM_GRID_FULL_REBUILD=1 to ignore anchors and replay the full log. */
export function fullRebuildRequested(env = process.env) {
  return env.AXIOM_GRID_FULL_REBUILD === '1';
}

/** Changes whenever a different connection has written to the database file. */
export function readDataVersion(db) {
  return db.prepare('PRAGMA data_version').get().data_version;
}

function anchorKey(layer) {
  return `materialization_anchor:${layer}`;
}

function quoteIdentifier(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

function canonicalCell(value) {
  if (value instanceof Uint8Array) return { b64: Buffer.from(value).toString('base64') };
  if (typeof value === 'bigint') return { int: value.toString() };
  return value;
}

/**
 * Streaming, order-independent-of-insertion digest of the given tables.
 * Rows are read in primary-key order (all columns when there is no key), one
 * at a time, so memory use does not grow with table size.
 */
export function digestMaterializedTables(db, tables) {
  const hash = createHash('sha256');
  for (const table of [...tables].sort()) {
    const quoted = quoteIdentifier(table);
    const columns = db.prepare(`PRAGMA table_info(${quoted})`).all();
    if (columns.length === 0) throw new Error(`Materialized table does not exist: ${table}`);
    const keyColumns = columns.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
    const order = (keyColumns.length > 0 ? keyColumns : columns).map((c) => quoteIdentifier(c.name)).join(', ');

    hash.update(`table\u0000${table}\u0000${columns.map((c) => c.name).join(',')}\n`);
    let rows = 0;
    for (const row of db.prepare(`SELECT * FROM ${quoted} ORDER BY ${order}`).iterate()) {
      const cells = {};
      for (const column of columns) cells[column.name] = canonicalCell(row[column.name]);
      hash.update(canonicalJson(cells));
      hash.update('\n');
      rows += 1;
    }
    hash.update(`rows\u0000${rows}\n`);
  }
  return hash.digest('hex');
}

/**
 * Identifies the code and schema that produced a layer's state. When any part
 * changes the anchor no longer matches and the layer is rebuilt once.
 *
 * Bump `layerVersion` whenever that layer's event-application logic changes.
 * The kernel version is included as well, so every release rebuilds once on
 * first start even if a bump is missed.
 */
export function layerFingerprint({ layer, layerVersion, schema }) {
  const applied = Array.isArray(schema?.applied)
    ? schema.applied.map((m) => `${m.version}:${m.checksum ?? ''}`).join(',')
    : '';
  return `${layer}:${layerVersion}|kernel:${KERNEL_VERSION}|schema:${schema?.version ?? 0}:${sha256(applied)}`;
}

function readMeta(db, key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value;
}

function chainPosition(db) {
  return {
    last_seq: Number(readMeta(db, 'last_seq')),
    last_hash: readMeta(db, 'last_hash')
  };
}

export function buildAnchorBody(db, { layer, fingerprint, tables }) {
  return {
    format: MATERIALIZATION_ANCHOR_FORMAT,
    layer,
    fingerprint,
    ...chainPosition(db),
    tables: [...tables].sort(),
    state_digest: digestMaterializedTables(db, tables)
  };
}

/** Records a signed anchor for the layer's current state. Call inside a write transaction. */
export function writeMaterializationAnchor(store, layer) {
  const spec = store.materializationLayers.get(layer);
  const body = buildAnchorBody(store.db, { layer, ...spec });
  const signature = store.identity.signObject(body);
  store.db
    .prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(anchorKey(layer), JSON.stringify({ body, signature }));
}

/** Removes a layer's anchor, forcing the next startup to replay that layer. */
export function clearMaterializationAnchor(store, layer) {
  store.db.prepare('DELETE FROM meta WHERE key = ?').run(anchorKey(layer));
}

/**
 * Decides whether a layer's persisted state can be trusted without replay.
 * Returns { valid, reason }; reason explains every rejection.
 */
export function checkMaterializationAnchor(store, layer) {
  const spec = store.materializationLayers.get(layer);
  const raw = readMeta(store.db, anchorKey(layer));
  if (raw === undefined) return { valid: false, reason: 'missing' };

  let anchor;
  try {
    anchor = JSON.parse(raw);
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  const { body, signature } = anchor ?? {};
  if (!body || body.format !== MATERIALIZATION_ANCHOR_FORMAT || body.layer !== layer) {
    return { valid: false, reason: 'malformed' };
  }

  const key = signature && store.verificationKeys.get(signature.key_id);
  if (!key || !verifyObjectSignature(body, signature, key)) {
    return { valid: false, reason: 'signature' };
  }

  if (body.fingerprint !== spec.fingerprint) return { valid: false, reason: 'fingerprint' };

  const position = chainPosition(store.db);
  if (body.last_seq !== position.last_seq || body.last_hash !== position.last_hash) {
    return { valid: false, reason: 'stale' };
  }

  const tables = [...spec.tables].sort();
  if (JSON.stringify(body.tables) !== JSON.stringify(tables)) return { valid: false, reason: 'tables' };

  if (digestMaterializedTables(store.db, tables) !== body.state_digest) {
    return { valid: false, reason: 'state_digest' };
  }

  return { valid: true, reason: 'verified' };
}
