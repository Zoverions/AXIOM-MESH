import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  reserveProductionPortBlock
} from '../src/lib/production-host.mjs';

test('production port leases serialize overlapping drill candidates', async t => {
  const lockRoot = await mkdtemp(join(tmpdir(), 'axiom-port-leases-'));
  const leases = [];
  t.after(async () => {
    await Promise.allSettled(leases.map(lease => lease.release()));
    await rm(lockRoot, { recursive: true, force: true });
  });

  const firstSample = 0.125;
  const randomWithFallback = fallback => {
    let first = true;
    return () => {
      if (!first) return fallback;
      first = false;
      return firstSample;
    };
  };
  const [first, second] = await Promise.all([
    reserveProductionPortBlock('first drill', {
      lockRoot,
      random: randomWithFallback(0.375)
    }),
    reserveProductionPortBlock('second drill', {
      lockRoot,
      random: randomWithFallback(0.625)
    })
  ]);
  leases.push(first, second);

  assert.equal(first.schema, 'axiom-production-port-lease.v1');
  assert.equal(first.ports.length, 4);
  assert.equal(first.base_port % 4, 0);
  assert.equal(second.base_port % 4, 0);
  assert.equal(
    first.ports.some(port => second.ports.includes(port)),
    false
  );

  const initialBase = basePortForSample(firstSample);
  const initialLease = [first, second].find(
    lease => lease.base_port === initialBase
  );
  assert.ok(initialLease);
  await initialLease.release();
  await initialLease.release();
  const replacement = await reserveProductionPortBlock('replacement drill', {
    lockRoot,
    random: () => firstSample
  });
  leases.push(replacement);
  assert.equal(replacement.base_port, initialBase);
});

test('production port leases reject an externally occupied candidate block', async t => {
  const lockRoot = await mkdtemp(join(tmpdir(), 'axiom-port-leases-'));
  const firstSample = 0.2;
  const firstBase = basePortForSample(firstSample);
  const occupied = net.createServer();
  await new Promise((resolvePromise, reject) => {
    occupied.once('error', reject);
    occupied.listen(firstBase + 2, '127.0.0.1', resolvePromise);
  });
  let lease;
  t.after(async () => {
    if (lease) await lease.release();
    await new Promise(resolvePromise => occupied.close(resolvePromise));
    await rm(lockRoot, { recursive: true, force: true });
  });

  const samples = [firstSample, 0.8];
  lease = await reserveProductionPortBlock('occupied-port drill', {
    lockRoot,
    random: () => samples.shift() ?? 0.9
  });
  assert.notEqual(lease.base_port, firstBase);
  assert.equal(lease.ports.includes(firstBase + 2), false);
});

function basePortForSample(sample) {
  return 20_000 + Math.floor(sample * 5_000) * 4;
}
