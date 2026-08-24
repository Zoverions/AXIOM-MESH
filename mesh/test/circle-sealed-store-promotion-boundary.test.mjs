import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production Grid remains on accepted Social and cannot select sealed Circle storage implicitly', async () => {
  const [gridServer, sealedSource] = await Promise.all([
    readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/grid/sealed-accepted-social-circle-store.mjs', import.meta.url), 'utf8')
  ]);

  assert.match(gridServer, /import \{ AcceptedSocialGridStore \} from '\.\/accepted-social-store\.mjs';/);
  assert.match(gridServer, /new AcceptedSocialGridStore\s*\(/);
  assert.doesNotMatch(gridServer, /sealed-accepted-social-circle-store\.mjs/);
  assert.doesNotMatch(gridServer, /SealedAcceptedSocialCircleGridStore/);

  assert.match(sealedSource, /commitCirclePersistenceWithPossessionBoundAtomicAdmission/);
  assert.match(sealedSource, /commitPossessionBoundCirclePersistence/);
  assert.match(sealedSource, /Raw Circle persistence events are sealed/);
  assert.match(sealedSource, /Direct lifecycle-guarded Circle append is sealed/);
  assert.match(sealedSource, /Raw Circle member lifecycle events are sealed/);
  assert.doesNotMatch(sealedSource, /this\[SEALED_CONTEXT\]\s*=\s*AUTHORIZED_MEMBER_LIFECYCLE/);
});

test('generic Grid commit remains generic but a future sealed-store selection would reject Circle event kinds', async () => {
  const gridServer = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  const sealedSource = await readFile(
    new URL('../src/grid/sealed-accepted-social-circle-store.mjs', import.meta.url),
    'utf8'
  );

  assert.match(gridServer, /router\.add\('POST', '\/internal\/v1\/commit'/);
  assert.match(gridServer, /store\.appendEvents\(\{ traceId, actor, events: input\.events \}\)/);
  assert.match(sealedSource, /eventKinds\.has\(CIRCLE_GRID_PERSISTENCE_EVENT_KIND\)/);
  assert.match(sealedSource, /eventKinds\.has\(CIRCLE_MEMBER_LIFECYCLE_EVENT_KIND\)/);
  assert.match(sealedSource, /this\[SEALED_CONTEXT\] !== POSSESSION_BOUND_PERSISTENCE/);
  assert.match(sealedSource, /this\[SEALED_CONTEXT\] !== AUTHORIZED_MEMBER_LIFECYCLE/);
});

test('sealed admission adds no Gateway or Hypervisor Circle runtime route', async () => {
  const [gatewayServer, hypervisorServer] = await Promise.all([
    readFile(new URL('../src/gateway/server.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/hypervisor/server.mjs', import.meta.url), 'utf8')
  ]);

  for (const source of [gatewayServer, hypervisorServer]) {
    assert.doesNotMatch(source, /sealed-accepted-social-circle-store\.mjs/);
    assert.doesNotMatch(source, /commitCirclePersistenceWithPossessionBoundAtomicAdmission/);
    assert.doesNotMatch(source, /circle\.persistence\.append/);
  }
});
