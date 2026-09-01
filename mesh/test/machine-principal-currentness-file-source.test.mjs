import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson, digestObject } from '../src/lib/canonical.mjs';
import {
  createMachinePrincipalCurrentnessCheckpoint
} from '../src/lib/machine-principal-currentness-checkpoint.mjs';
import {
  openMachinePrincipalCurrentnessStore
} from '../src/lib/machine-principal-currentness-store.mjs';
import {
  createMachinePrincipalCurrentnessFileSource
} from '../src/lib/machine-principal-currentness-file-source.mjs';

const PRINCIPAL_ID = 'agent.file-source.1';
const PRINCIPAL_TYPE = 'agent';
const AUTHORITY_A = 'a'.repeat(64);
const AUTHORITY_B = 'b'.repeat(64);

function state({
  authorityDigest = AUTHORITY_A,
  status = 'active',
  sequence = 1,
  observedAt = '2026-09-01T18:30:00.000Z',
  sourceSeed = 'head-1',
  predecessorHeadDigest = null
} = {}) {
  return {
    schema: 'axiom-machine-principal-currentness.v1',
    principal_id: PRINCIPAL_ID,
    principal_type: PRINCIPAL_TYPE,
    authority_digest: authorityDigest,
    status,
    sequence,
    observed_at: observedAt,
    source_head_digest: digestObject({
      schema: 'test-machine-currentness-file-source-head.v1',
      sourceSeed,
      authorityDigest,
      status,
      sequence,
      observedAt
    }),
    predecessor_head_digest: predecessorHeadDigest,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  };
}

function keys() {
  return generateKeyPairSync('ed25519');
}

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-currentness-file-source-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const controller = keys();
  const statePath = join(dir, 'currentness.jsonl');
  const writer = await openMachinePrincipalCurrentnessStore({
    statePath,
    trustedControllerPublicKey: controller.publicKey,
    expectedPrincipalId: PRINCIPAL_ID,
    expectedPrincipalType: PRINCIPAL_TYPE
  });
  const firstState = state();
  const first = createMachinePrincipalCurrentnessCheckpoint({
    currentness: firstState,
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  await writer.retain(first);
  return { dir, controller, statePath, writer, first, firstState };
}

function source(f, extra = {}) {
  return createMachinePrincipalCurrentnessFileSource({
    entries: [{
      principalId: PRINCIPAL_ID,
      principalType: PRINCIPAL_TYPE,
      statePath: f.statePath,
      trustedControllerPublicKey: f.controller.publicKey,
      ...extra
    }]
  });
}

test('read-only source reopens durable state and observes writer successor without shared memory', async t => {
  const f = await fixture(t);
  const reader = source(f);

  const first = await reader.resolveRetainedHead({
    principalId: PRINCIPAL_ID,
    principalType: PRINCIPAL_TYPE
  });
  assert.equal(first.retained_checkpoint_digest, f.first.checkpoint_digest);
  assert.equal(first.checkpoint_count, 1);
  assert.equal(first.fresh_disk_read_performed, true);
  assert.equal(first.state_mutation_performed, false);
  assert.equal(first.caller_selected_path_allowed, false);
  assert.equal(first.global_currentness_claimed, false);

  const secondState = state({
    authorityDigest: AUTHORITY_B,
    sequence: 2,
    observedAt: '2026-09-01T18:30:01.000Z',
    sourceSeed: 'head-2',
    predecessorHeadDigest: f.firstState.source_head_digest
  });
  const second = createMachinePrincipalCurrentnessCheckpoint({
    currentness: secondState,
    controllerPrivateKey: f.controller.privateKey,
    trustedControllerPublicKey: f.controller.publicKey
  });
  await f.writer.retain(second);

  const resolved = await reader.resolveRetainedHead({
    principalId: PRINCIPAL_ID,
    principalType: PRINCIPAL_TYPE
  });
  assert.equal(resolved.retained_checkpoint_digest, second.checkpoint_digest);
  assert.equal(resolved.retained_source_head_digest, secondState.source_head_digest);
  assert.equal(resolved.checkpoint_count, 2);
});

test('read-only source never rewrites or repairs configured state', async t => {
  const f = await fixture(t);
  const reader = source(f);
  const before = await readFile(f.statePath);

  await reader.resolveRetainedHead({
    principalId: PRINCIPAL_ID,
    principalType: PRINCIPAL_TYPE
  });

  const after = await readFile(f.statePath);
  assert.deepEqual(after, before);
});

test('source rejects unknown principal, type substitution and duplicate configured principal', async t => {
  const f = await fixture(t);
  const reader = source(f);

  await assert.rejects(
    reader.resolveRetainedHead({
      principalId: 'agent.unknown',
      principalType: 'agent'
    }),
    /no configured principal/
  );
  await assert.rejects(
    reader.resolveRetainedHead({
      principalId: PRINCIPAL_ID,
      principalType: 'service'
    }),
    /type does not match configured trust/
  );

  assert.throws(
    () => createMachinePrincipalCurrentnessFileSource({
      entries: [{
        principalId: PRINCIPAL_ID,
        principalType: PRINCIPAL_TYPE,
        statePath: f.statePath,
        trustedControllerPublicKey: f.controller.publicKey
      }, {
        principalId: PRINCIPAL_ID,
        principalType: PRINCIPAL_TYPE,
        statePath: join(f.dir, 'other.jsonl'),
        trustedControllerPublicKey: f.controller.publicKey
      }]
    }),
    /Duplicate machine currentness file-source principal/
  );
});

test('caller cannot select an alternate currentness path or controller key', async t => {
  const f = await fixture(t);
  const alternatePath = join(f.dir, 'attacker.jsonl');
  const attacker = keys();
  const attackerState = state({
    authorityDigest: 'f'.repeat(64),
    sourceSeed: 'attacker'
  });
  const attackerCheckpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: attackerState,
    controllerPrivateKey: attacker.privateKey,
    trustedControllerPublicKey: attacker.publicKey
  });
  await writeFile(alternatePath, `${canonicalJson(attackerCheckpoint)}\n`, 'utf8');

  const reader = source(f);
  const result = await reader.resolveRetainedHead({
    principalId: PRINCIPAL_ID,
    principalType: PRINCIPAL_TYPE,
    statePath: alternatePath,
    trustedControllerPublicKey: attacker.publicKey
  });
  assert.equal(result.retained_checkpoint_digest, f.first.checkpoint_digest);
  assert.equal(result.retained_latest_checkpoint.statement.authority_digest, AUTHORITY_A);
});

test('symlink, torn, non-canonical, tampered and truncated histories fail closed', async t => {
  const f = await fixture(t);
  const alternate = keys();

  const symlinkPath = join(f.dir, 'link.jsonl');
  await symlink(f.statePath, symlinkPath);
  const symlinkSource = createMachinePrincipalCurrentnessFileSource({
    entries: [{
      principalId: PRINCIPAL_ID,
      principalType: PRINCIPAL_TYPE,
      statePath: symlinkPath,
      trustedControllerPublicKey: f.controller.publicKey
    }]
  });
  await assert.rejects(
    symlinkSource.resolveRetainedHead({
      principalId: PRINCIPAL_ID,
      principalType: PRINCIPAL_TYPE
    }),
    /regular non-symlink file/
  );

  const cases = [];
  const tornPath = join(f.dir, 'torn.jsonl');
  await writeFile(tornPath, canonicalJson(f.first), 'utf8');
  cases.push([tornPath, f.controller.publicKey, /incomplete trailing|torn/i]);

  const prettyPath = join(f.dir, 'pretty.jsonl');
  await writeFile(prettyPath, `${JSON.stringify(f.first, null, 2)}\n`, 'utf8');
  cases.push([prettyPath, f.controller.publicKey, /canonical JSON/i]);

  const tamperedPath = join(f.dir, 'tampered.jsonl');
  const tampered = structuredClone(f.first);
  tampered.statement.authority_digest = '9'.repeat(64);
  await writeFile(tamperedPath, `${canonicalJson(tampered)}\n`, 'utf8');
  cases.push([tamperedPath, f.controller.publicKey, /statement digest|signature|digest mismatch/i]);

  const secondState = state({
    authorityDigest: AUTHORITY_B,
    sequence: 2,
    observedAt: '2026-09-01T18:30:01.000Z',
    sourceSeed: 'head-2-truncated',
    predecessorHeadDigest: f.firstState.source_head_digest
  });
  const second = createMachinePrincipalCurrentnessCheckpoint({
    currentness: secondState,
    controllerPrivateKey: f.controller.privateKey,
    trustedControllerPublicKey: f.controller.publicKey
  });
  const truncatedPath = join(f.dir, 'truncated.jsonl');
  await writeFile(truncatedPath, `${canonicalJson(second)}\n`, 'utf8');
  cases.push([truncatedPath, f.controller.publicKey, /begin at sequence 1|truncated/i]);

  const wrongKeyPath = join(f.dir, 'wrong-key.jsonl');
  await writeFile(wrongKeyPath, `${canonicalJson(f.first)}\n`, 'utf8');
  cases.push([wrongKeyPath, alternate.publicKey, /controller key mismatch|signature verification/i]);

  for (const [statePath, trustedControllerPublicKey, pattern] of cases) {
    const reader = createMachinePrincipalCurrentnessFileSource({
      entries: [{
        principalId: PRINCIPAL_ID,
        principalType: PRINCIPAL_TYPE,
        statePath,
        trustedControllerPublicKey
      }]
    });
    await assert.rejects(
      reader.resolveRetainedHead({
        principalId: PRINCIPAL_ID,
        principalType: PRINCIPAL_TYPE
      }),
      pattern
    );
  }
});

test('configured state and checkpoint byte limits fail closed', async t => {
  const f = await fixture(t);
  const bytes = await readFile(f.statePath);
  const lineBytes = Buffer.byteLength(canonicalJson(f.first), 'utf8');

  const stateBound = source(f, { maxStateBytes: bytes.length - 1 });
  await assert.rejects(
    stateBound.resolveRetainedHead({
      principalId: PRINCIPAL_ID,
      principalType: PRINCIPAL_TYPE
    }),
    /state exceeds configured byte limit/i
  );

  const checkpointBound = source(f, { maxCheckpointBytes: lineBytes - 1 });
  await assert.rejects(
    checkpointBound.resolveRetainedHead({
      principalId: PRINCIPAL_ID,
      principalType: PRINCIPAL_TYPE
    }),
    /checkpoint 1 exceeds configured byte limit/i
  );
});

test('empty configured state fails closed rather than fabricating a retained head', async t => {
  const f = await fixture(t);
  const empty = join(f.dir, 'empty.jsonl');
  await writeFile(empty, '', 'utf8');
  const reader = createMachinePrincipalCurrentnessFileSource({
    entries: [{
      principalId: PRINCIPAL_ID,
      principalType: PRINCIPAL_TYPE,
      statePath: empty,
      trustedControllerPublicKey: f.controller.publicKey
    }]
  });
  await assert.rejects(
    reader.resolveRetainedHead({
      principalId: PRINCIPAL_ID,
      principalType: PRINCIPAL_TYPE
    }),
    /no retained checkpoint/
  );
});
