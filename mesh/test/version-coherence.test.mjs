import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryRoot = new URL('../../', import.meta.url);
const meshRoot = new URL('../', import.meta.url);

async function json(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('live release metadata agrees on one kernel version', async () => {
  const [rootPackage, rootLock, kernelPackage, kernelLock, registry, operatorSurface, readme] = await Promise.all([
    json(new URL('package.json', repositoryRoot)),
    json(new URL('package-lock.json', repositoryRoot)),
    json(new URL('package.json', meshRoot)),
    json(new URL('package-lock.json', meshRoot)),
    json(new URL('config/capabilities.json', meshRoot)),
    json(new URL('config/operator-surface.json', meshRoot)),
    readFile(new URL('README.md', repositoryRoot), 'utf8')
  ]);

  const version = kernelPackage.version;
  assert.equal(rootPackage.version, version, 'root package version drifted');
  assert.equal(rootLock.version, version, 'root lock version drifted');
  assert.equal(rootLock.packages?.['']?.version, version, 'root lock package version drifted');
  assert.equal(kernelLock.version, version, 'kernel lock version drifted');
  assert.equal(kernelLock.packages?.['']?.version, version, 'kernel lock package version drifted');
  assert.equal(registry.kernel_version, version, 'capability registry version drifted');
  assert.equal(operatorSurface.kernel_version, version, 'operator surface version drifted');

  const marker = readme.match(/axiom-capability-registry: schema=axiom-capabilities\.v1; kernel=([^;]+); digest=/);
  assert.ok(marker, 'README capability registry marker is missing');
  assert.equal(marker[1], version, 'README capability registry marker version drifted');
  assert.ok(readme.includes(`**Supported build:** \`${version}\``), 'README supported build version drifted');
});
