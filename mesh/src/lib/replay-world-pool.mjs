import { canonicalize, digestObject, ValidationError } from './canonical.mjs';
import {
  assertBoundedId,
  assertCanonicalInstant,
  assertExactKeys,
  assertSha256,
  deepFreezeJson
} from './replay-grounded-common.mjs';
import { validateReplayWorld, digestReplayWorld } from './replay-world.mjs';

export const REPLAY_WORLD_POOL_SCHEMA = 'axiom-replay-world-pool.v0';

const POOL_KEYS = Object.freeze([
  'schema', 'status', 'pool_id', 'cycle_id', 'role', 'visibility', 'worlds',
  'selection', 'created_at', 'authority_effect', 'network_effect',
  'runtime_activation', 'production_promotion'
]);
const ROLES = new Set(['training', 'validation', 'sealed-holdout']);
const VISIBILITIES = new Set(['development-visible', 'acceptance-sealed']);
const COMPATIBILITY = new Set(['historical-valid', 'current-compatible', 'incompatible', 'unverified']);
const SELECTION_METHODS = new Set(['explicit', 'seeded']);
const UINT32_MAX = 0xffffffff;

function literal(actual, expected, name) {
  if (actual !== expected) throw new ValidationError(`${name} must equal ${JSON.stringify(expected)}`);
}

function compareAscii(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function validateReplayWorldPool(input) {
  const pool = canonicalize(input);
  assertExactKeys(pool, POOL_KEYS, 'replay_world_pool');
  literal(pool.schema, REPLAY_WORLD_POOL_SCHEMA, 'schema');
  literal(pool.status, 'inert-world-pool', 'status');
  assertBoundedId(pool.pool_id, 'pool_id');
  assertBoundedId(pool.cycle_id, 'cycle_id');
  if (!ROLES.has(pool.role)) throw new ValidationError('role is unsupported');
  if (!VISIBILITIES.has(pool.visibility)) throw new ValidationError('visibility is unsupported');
  if ((pool.role === 'training' || pool.role === 'validation') && pool.visibility !== 'development-visible') {
    throw new ValidationError(`${pool.role} pools must be development-visible`);
  }
  if (pool.role === 'sealed-holdout' && pool.visibility !== 'acceptance-sealed') {
    throw new ValidationError('sealed-holdout pools must be acceptance-sealed');
  }

  if (!Array.isArray(pool.worlds) || pool.worlds.length === 0) {
    throw new ValidationError('worlds must be a non-empty array');
  }
  const ids = new Set();
  const digests = new Set();
  let previousId = null;
  for (let index = 0; index < pool.worlds.length; index += 1) {
    const entry = pool.worlds[index];
    assertExactKeys(entry, ['world_id', 'world_digest', 'compatibility'], `worlds[${index}]`);
    assertBoundedId(entry.world_id, `worlds[${index}].world_id`);
    assertSha256(entry.world_digest, `worlds[${index}].world_digest`);
    if (!COMPATIBILITY.has(entry.compatibility)) {
      throw new ValidationError(`worlds[${index}].compatibility is unsupported`);
    }
    if (ids.has(entry.world_id)) throw new ValidationError('worlds cannot contain duplicate world_id values');
    if (digests.has(entry.world_digest)) throw new ValidationError('worlds cannot contain duplicate world_digest values');
    if (previousId !== null && compareAscii(entry.world_id, previousId) <= 0) {
      throw new ValidationError('worlds must be strictly ordered by world_id');
    }
    ids.add(entry.world_id);
    digests.add(entry.world_digest);
    previousId = entry.world_id;
  }

  assertExactKeys(pool.selection, ['method', 'seed', 'evidence_ref', 'evidence_digest'], 'selection');
  if (!SELECTION_METHODS.has(pool.selection.method)) throw new ValidationError('selection.method is unsupported');
  assertBoundedId(pool.selection.evidence_ref, 'selection.evidence_ref');
  assertSha256(pool.selection.evidence_digest, 'selection.evidence_digest');
  if (pool.selection.method === 'explicit') {
    if (pool.selection.seed !== null) throw new ValidationError('explicit selection requires seed=null');
  } else if (!Number.isSafeInteger(pool.selection.seed) || pool.selection.seed < 0 || pool.selection.seed > UINT32_MAX) {
    throw new ValidationError('seeded selection requires an unsigned 32-bit integer seed');
  }

  assertCanonicalInstant(pool.created_at, 'created_at');
  literal(pool.authority_effect, 'none', 'authority_effect');
  literal(pool.network_effect, 'none', 'network_effect');
  literal(pool.runtime_activation, false, 'runtime_activation');
  literal(pool.production_promotion, false, 'production_promotion');
  return deepFreezeJson(pool);
}

export function digestReplayWorldPool(input) {
  return digestObject(validateReplayWorldPool(input));
}

export function resolveReplayWorldPool(poolInput, worldInputs) {
  const pool = validateReplayWorldPool(poolInput);
  if (!Array.isArray(worldInputs)) throw new ValidationError('worldInputs must be an array');
  if (worldInputs.length !== pool.worlds.length) {
    throw new ValidationError('worldInputs must contain exactly the worlds declared by the pool');
  }

  const supplied = new Map();
  for (let index = 0; index < worldInputs.length; index += 1) {
    const world = validateReplayWorld(worldInputs[index]);
    if (supplied.has(world.world_id)) throw new ValidationError('worldInputs cannot contain duplicate world_id values');
    supplied.set(world.world_id, world);
  }

  const resolvedWorlds = [];
  const declaredIds = new Set(pool.worlds.map((entry) => entry.world_id));
  for (const suppliedId of supplied.keys()) {
    if (!declaredIds.has(suppliedId)) throw new ValidationError(`unexpected supplied world ${suppliedId}`);
  }
  for (const entry of pool.worlds) {
    const world = supplied.get(entry.world_id);
    if (!world) throw new ValidationError(`missing supplied world ${entry.world_id}`);
    const digest = digestReplayWorld(world);
    if (digest !== entry.world_digest) throw new ValidationError(`world digest mismatch for ${entry.world_id}`);
    resolvedWorlds.push({
      world_id: entry.world_id,
      world_digest: digest,
      compatibility: entry.compatibility,
      world
    });
  }

  return deepFreezeJson({
    pool,
    pool_digest: digestObject(pool),
    world_ids: pool.worlds.map((entry) => entry.world_id),
    current_acceptance_world_ids: pool.worlds
      .filter((entry) => entry.compatibility === 'current-compatible')
      .map((entry) => entry.world_id),
    resolved_worlds: resolvedWorlds
  });
}

export function validateReplayPoolPartition(partition) {
  const canonical = canonicalize(partition);
  assertExactKeys(canonical, ['training', 'validation', 'holdout'], 'partition');
  const training = validateReplayWorldPool(canonical.training);
  const validation = validateReplayWorldPool(canonical.validation);
  const holdout = validateReplayWorldPool(canonical.holdout);
  literal(training.role, 'training', 'training.role');
  literal(validation.role, 'validation', 'validation.role');
  literal(holdout.role, 'sealed-holdout', 'holdout.role');

  if (training.cycle_id !== validation.cycle_id || training.cycle_id !== holdout.cycle_id) {
    throw new ValidationError('partition pools must share one cycle_id');
  }
  const poolIds = [training.pool_id, validation.pool_id, holdout.pool_id];
  if (new Set(poolIds).size !== 3) throw new ValidationError('partition pool_ids must be distinct');
  const poolDigests = [
    digestObject(training),
    digestObject(validation),
    digestObject(holdout)
  ];
  if (new Set(poolDigests).size !== 3) throw new ValidationError('partition pool digests must be distinct');

  const seenWorldDigests = new Map();
  for (const [role, pool] of [['training', training], ['validation', validation], ['holdout', holdout]]) {
    for (const entry of pool.worlds) {
      if (seenWorldDigests.has(entry.world_digest)) {
        throw new ValidationError(
          `world digest ${entry.world_digest} overlaps ${seenWorldDigests.get(entry.world_digest)} and ${role}`
        );
      }
      seenWorldDigests.set(entry.world_digest, role);
    }
  }

  return deepFreezeJson({
    cycle_id: training.cycle_id,
    training_pool_id: training.pool_id,
    training_pool_digest: poolDigests[0],
    validation_pool_id: validation.pool_id,
    validation_pool_digest: poolDigests[1],
    holdout_pool_id: holdout.pool_id,
    holdout_pool_digest: poolDigests[2],
    world_digest_overlap: false,
    authority_effect: 'none'
  });
}

export function projectDevelopmentPool(poolInput) {
  const pool = validateReplayWorldPool(poolInput);
  if (pool.visibility !== 'development-visible') {
    throw new ValidationError('acceptance-sealed pool cannot be projected through the development helper');
  }
  return deepFreezeJson({
    schema: pool.schema,
    pool_id: pool.pool_id,
    pool_digest: digestObject(pool),
    cycle_id: pool.cycle_id,
    role: pool.role,
    visibility: pool.visibility,
    worlds: pool.worlds.map((entry) => ({ ...entry })),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  });
}
