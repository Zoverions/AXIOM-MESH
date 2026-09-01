import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const files = {
  successor: new URL('../src/grid/circle-authorized-admission-lifecycle-cas.mjs', import.meta.url),
  guardedStore: new URL('../src/grid/circle-lifecycle-guarded-store.mjs', import.meta.url),
  circleStore: new URL('../src/grid/circle-store.mjs', import.meta.url),
  coreStore: new URL('../src/grid/_store-core.mjs', import.meta.url),
  gridServer: new URL('../src/grid/server.mjs', import.meta.url),
  hypervisorServer: new URL('../src/hypervisor/server.mjs', import.meta.url),
  gatewayServer: new URL('../src/gateway/server.mjs', import.meta.url)
};

async function sources() {
  return Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, url]) => [key, await readFile(url, 'utf8')])));
}

test('atomic lifecycle CAS remains an internal unwired successor instead of a public Circle route', async () => {
  const source = await sources();
  assert.match(source.successor, /appendCirclePersistenceWithLifecycleGuards/);
  assert.match(source.guardedStore, /class LifecycleGuardedCircleGridStore extends CircleGridStore/);
  assert.match(source.guardedStore, /assertCircleAdmissionLifecycleGuardsCurrent/);

  for (const runtime of [source.gridServer, source.hypervisorServer, source.gatewayServer]) {
    assert.doesNotMatch(runtime, /circle-authorized-admission-lifecycle-cas\.mjs/);
    assert.doesNotMatch(runtime, /LifecycleGuardedCircleGridStore/);
    assert.doesNotMatch(runtime, /appendCirclePersistenceWithLifecycleGuards/);
  }
});

test('lifecycle head guard executes from Circle materialization inside the established Grid transaction', async () => {
  const source = await sources();
  assert.match(source.coreStore, /return this\.transaction\(\(\) => \{/);
  assert.match(source.coreStore, /INSERT INTO events/);
  assert.match(source.coreStore, /this\.applyMaterializedEvent\(/);
  assert.match(source.circleStore, /this\.applyCirclePersistenceMaterializedEvent\(event\)/);
  assert.match(source.guardedStore, /applyCirclePersistenceMaterializedEvent\(event\)/);
  assert.match(source.guardedStore, /this\.assertCircleAdmissionLifecycleGuardsCurrent\(this\.circleAdmissionLifecycleGuardContext\)/);
  assert.match(source.guardedStore, /return super\.applyCirclePersistenceMaterializedEvent\(event\)/);

  assert.doesNotMatch(source.successor, /getCircleMemberLifecycleHead\([^)]*\).*appendCirclePersistenceWithLifecycleGuards/s);
  assert.doesNotMatch(source.successor, /assertCircleAdmissionLifecycleGuardsCurrent/);
});

test('successor does not mutate parent authorization or lifecycle-head contracts', async () => {
  const source = await sources();
  assert.doesNotMatch(source.circleStore, /circleAdmissionLifecycleGuardContext/);
  assert.doesNotMatch(source.circleStore, /appendCirclePersistenceWithLifecycleGuards/);
  assert.match(source.successor, /getCircleAuthorizedGridAdmissionPolicy/);
  assert.match(source.successor, /getCircleRecordAuthorizationLifecyclePolicy/);
});
