import assert from 'node:assert/strict';
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

import { digestObject } from '../src/lib/canonical.mjs';

async function replayStore() {
  return import('../src/lib/external-observation-replay-store.mjs');
}

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-replay-state-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function replayKey(senderId, nonce) {
  return digestObject({ sender_id: senderId, nonce });
}

function claimInput(statePath, overrides = {}) {
  return {
    state_path: statePath,
    sender_id: 'beacon.peer.example',
    nonce: 'nonce_0123456789abcdef0123456789abcdef',
    now: '2026-08-29T19:01:00.000Z',
    expires_at: '2026-08-29T19:05:00.000Z',
    ...overrides
  };
}

test('durably records an external sender nonce without granting authority', async () => {
  const {
    EXTERNAL_OBSERVATION_REPLAY_STATE_SCHEMA,
    claimExternalObservationReplay
  } = await replayStore();

  await withTempDir(async dir => {
    const statePath = join(dir, 'replay-state.json');
    const result = await claimExternalObservationReplay(claimInput(statePath));

    assert.equal(EXTERNAL_OBSERVATION_REPLAY_STATE_SCHEMA, 'axiom-external-observation-replay-state.v0');
    assert.equal(result.accepted, true);
    assert.equal(result.replay_persistence, true);
    assert.equal(result.authority_effect, 'none');
    assert.equal(result.network_effect, 'none');
    assert.equal(result.runtime_activation, false);
    assert.equal(result.replay_key, replayKey(
      'beacon.peer.example',
      'nonce_0123456789abcdef0123456789abcdef'
    ));
    assert.match(result.state_digest, /^[a-f0-9]{64}$/);
    assert.equal(Object.isFrozen(result), true);

    const persisted = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(persisted.schema, EXTERNAL_OBSERVATION_REPLAY_STATE_SCHEMA);
    assert.equal(persisted.entries.length, 1);
  });
});

test('replay survives a fresh state read and is rejected after restart-like reuse', async () => {
  const {
    claimExternalObservationReplay,
    readExternalObservationReplayState
  } = await replayStore();

  await withTempDir(async dir => {
    const statePath = join(dir, 'replay-state.json');
    const input = claimInput(statePath);
    await claimExternalObservationReplay(input);

    const reloaded = await readExternalObservationReplayState({
      state_path: statePath,
      now: '2026-08-29T19:01:30.000Z'
    });
    assert.equal(reloaded.entries.length, 1);
    assert.equal(reloaded.replay_persistence, true);

    await assert.rejects(
      () => claimExternalObservationReplay({
        ...input,
        now: '2026-08-29T19:01:30.000Z'
      }),
      /replay/i
    );
  });
});

test('expired replay entries are pruned before capacity is evaluated', async () => {
  const {
    claimExternalObservationReplay,
    readExternalObservationReplayState
  } = await replayStore();

  await withTempDir(async dir => {
    const statePath = join(dir, 'replay-state.json');
    await claimExternalObservationReplay(claimInput(statePath, {
      sender_id: 'peer.one',
      nonce: 'nonce_11111111111111111111111111111111',
      expires_at: '2026-08-29T19:02:00.000Z',
      max_entries: 1
    }));

    const second = await claimExternalObservationReplay(claimInput(statePath, {
      sender_id: 'peer.two',
      nonce: 'nonce_22222222222222222222222222222222',
      now: '2026-08-29T19:03:00.000Z',
      expires_at: '2026-08-29T19:05:00.000Z',
      max_entries: 1
    }));
    assert.equal(second.active_entries, 1);

    const state = await readExternalObservationReplayState({
      state_path: statePath,
      now: '2026-08-29T19:03:00.000Z',
      max_entries: 1
    });
    assert.deepEqual(state.entries.map(item => item.sender_id), ['peer.two']);
  });
});

test('active capacity saturation fails closed instead of evicting replay protection', async () => {
  const {
    claimExternalObservationReplay,
    readExternalObservationReplayState
  } = await replayStore();

  await withTempDir(async dir => {
    const statePath = join(dir, 'replay-state.json');
    await claimExternalObservationReplay(claimInput(statePath, {
      sender_id: 'peer.one',
      nonce: 'nonce_11111111111111111111111111111111',
      max_entries: 1
    }));

    await assert.rejects(
      () => claimExternalObservationReplay(claimInput(statePath, {
        sender_id: 'peer.two',
        nonce: 'nonce_22222222222222222222222222222222',
        max_entries: 1
      })),
      /capacity|full/i
    );

    const state = await readExternalObservationReplayState({
      state_path: statePath,
      now: '2026-08-29T19:01:00.000Z',
      max_entries: 1
    });
    assert.deepEqual(state.entries.map(item => item.sender_id), ['peer.one']);
  });
});

test('corrupt or widened persisted replay state fails closed', async () => {
  const {
    claimExternalObservationReplay,
    readExternalObservationReplayState
  } = await replayStore();

  await withTempDir(async dir => {
    const statePath = join(dir, 'replay-state.json');
    await writeFile(statePath, '{not-json', 'utf8');
    await assert.rejects(
      () => readExternalObservationReplayState({
        state_path: statePath,
        now: '2026-08-29T19:01:00.000Z'
      }),
      /replay state|json|corrupt/i
    );

    await rm(statePath);
    await claimExternalObservationReplay(claimInput(statePath));
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.authority_effect = 'grant';
    await writeFile(statePath, `${JSON.stringify(state)}\n`, 'utf8');
    await assert.rejects(
      () => readExternalObservationReplayState({
        state_path: statePath,
        now: '2026-08-29T19:01:00.000Z'
      }),
      /authority|boundary|digest/i
    );
  });
});

test('state symlinks and an unavailable writer lock fail closed', async () => {
  const {
    claimExternalObservationReplay,
    readExternalObservationReplayState
  } = await replayStore();

  await withTempDir(async dir => {
    const realPath = join(dir, 'real-state.json');
    await claimExternalObservationReplay(claimInput(realPath));

    const symlinkPath = join(dir, 'linked-state.json');
    await symlink(realPath, symlinkPath);
    await assert.rejects(
      () => readExternalObservationReplayState({
        state_path: symlinkPath,
        now: '2026-08-29T19:01:00.000Z'
      }),
      /regular file|symlink|unsafe/i
    );

    const lockedPath = join(dir, 'locked-state.json');
    await writeFile(`${lockedPath}.lock`, 'busy\n', 'utf8');
    await assert.rejects(
      () => claimExternalObservationReplay(claimInput(lockedPath)),
      /lock|unavailable|busy/i
    );
  });
});

test('input validation binds replay identity to sender id plus nonce', async () => {
  const { claimExternalObservationReplay } = await replayStore();

  await withTempDir(async dir => {
    const statePath = join(dir, 'replay-state.json');
    await assert.rejects(
      () => claimExternalObservationReplay(claimInput(statePath, {
        sender_id: '../escape'
      })),
      /sender_id|identifier/i
    );
    await assert.rejects(
      () => claimExternalObservationReplay(claimInput(statePath, {
        nonce: 'short'
      })),
      /nonce/i
    );
    await assert.rejects(
      () => claimExternalObservationReplay(claimInput(statePath, {
        expires_at: '2026-08-29T19:00:59.999Z'
      })),
      /expiry|expires/i
    );
  });
});
