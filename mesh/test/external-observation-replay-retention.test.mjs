import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { claimExternalObservationReplay } from '../src/lib/external-observation-replay-store.mjs';

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-replay-retention-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('durable external replay claims cannot extend protection beyond five minutes', async () => {
  await withTempDir(async dir => {
    await assert.rejects(
      () => claimExternalObservationReplay({
        state_path: join(dir, 'replay-state.json'),
        sender_id: 'beacon.peer.example',
        nonce: 'nonce_0123456789abcdef0123456789abcdef',
        now: '2026-08-29T19:01:00.000Z',
        expires_at: '2026-08-29T19:06:00.001Z'
      }),
      /five-minute|5 minute|retention|lifetime/i
    );
  });
});
