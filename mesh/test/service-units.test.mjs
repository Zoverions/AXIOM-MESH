import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  runServiceUnitDrill,
  verifyServiceUnitDrillEvidence
} from '../src/service-unit-drill.mjs';
import {
  DEPLOYABLE_SERVICES,
  provisionServiceUnits,
  validateServiceUnits
} from '../src/lib/service-units.mjs';
import { rotateTransportCredentials } from '../src/lib/transport-credentials.mjs';
import { provisionProduction } from '../src/provision-production.mjs';

test('service-unit projection isolates private identities and durable state', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-service-units-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const provisioned = await provisionProduction({
    dataDir: join(root, 'source-data'),
    secretDir: join(root, 'secrets')
  });
  const result = await provisionServiceUnits({
    sourceDataDir: provisioned.data_dir,
    sourceTransportDir: provisioned.transport.transport_dir,
    unitsDir: join(root, 'units')
  });
  assert.equal(result.valid, true);
  assert.deepEqual(Object.keys(result.services), [...DEPLOYABLE_SERVICES]);

  for (const service of DEPLOYABLE_SERVICES) {
    const unit = result.services[service];
    await access(join(
      unit.data_dir,
      'identities',
      service,
      'private.pem'
    ));
    await access(join(
      unit.transport_dir,
      'services',
      `${service}.key.pem`
    ));
    assert.equal(
      await exists(join(unit.transport_dir, 'ca-key.pem')),
      false
    );
    for (const other of DEPLOYABLE_SERVICES) {
      if (other === service) continue;
      assert.equal(
        await exists(join(
          unit.data_dir,
          'identities',
          other,
          'private.pem'
        )),
        false
      );
      assert.equal(
        await exists(join(
          unit.transport_dir,
          'services',
          `${other}.key.pem`
        )),
        false
      );
    }
    assert.equal(
      await exists(join(unit.data_dir, 'grid.sqlite')),
      service === 'grid'
        ? await exists(join(provisioned.data_dir, 'grid.sqlite'))
        : false
    );
  }

  const idempotent = await provisionServiceUnits({
    sourceDataDir: provisioned.data_dir,
    sourceTransportDir: provisioned.transport.transport_dir,
    unitsDir: join(root, 'units')
  });
  assert.equal(idempotent.valid, true);

  await rotateTransportCredentials({
    secretDir: provisioned.secret_dir
  });
  await assert.rejects(
    () => validateServiceUnits({
      sourceDataDir: provisioned.data_dir,
      sourceTransportDir: provisioned.transport.transport_dir,
      unitsDir: join(root, 'units')
    }),
    /stale relative/
  );
});

test('independent service drill signs failure isolation and exact recovery', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-service-unit-drill-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  const evidence = await runServiceUnitDrill({
    workspaceDir: workspace,
    sourceRevision: 'b'.repeat(40),
    generatedAt: '2026-07-29T04:00:00.000Z'
  });
  const verification = verifyServiceUnitDrillEvidence(evidence);
  assert.equal(verification.valid, true);
  assert.equal(verification.unit_count, 4);
  assert.ok(Object.values(evidence.checks).every(Boolean));
  assert.doesNotMatch(
    JSON.stringify(evidence),
    /PRIVATE KEY|operator\.token|authorization:\s*bearer/i
  );

  const tampered = structuredClone(evidence);
  tampered.observations.recovered_status = 'not_ready';
  assert.throws(
    () => verifyServiceUnitDrillEvidence(tampered),
    /metadata or checks/
  );
});

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
