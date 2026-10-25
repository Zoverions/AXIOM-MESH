import assert from 'node:assert/strict';
import test from 'node:test';

test('clean-room enumeration reproduces the published alpha record census and detects dimension drift', async () => {
  const moduleUrl = new URL('../../labs/chain-theory/reproduce-alpha.mjs', import.meta.url);
  const reproduction = await import(moduleUrl).catch(() => null);
  assert.ok(reproduction, 'the clean-room reproduction module must exist');
  const { reproduceAlphaCensus } = reproduction;

  const published = reproduceAlphaCensus();
  assert.deepEqual(published.slotLetters, [8, 3, 8, 3]);
  assert.deepEqual(published.sectorCounts, {
    one: 79,
    sqrt2: 48,
    sqrt3: 42,
    sqrt6: 3,
  });
  assert.equal(published.productRecords, 169);
  assert.equal(published.commutatorRecords, 3);
  assert.equal(published.totalRecords, 172);
  assert.equal(published.normalization, 31_104);
  assert.ok(Math.abs(published.inverseAlpha - 137.03599918956615) < 1e-12);
  assert.equal(published.matchesPublishedCensus, true);

  const dimensionDrift = reproduceAlphaCensus({ qutritDimension: 4 });
  assert.equal(dimensionDrift.matchesPublishedCensus, false);
  assert.notDeepEqual(dimensionDrift.sectorCounts, published.sectorCounts);
  assert.notEqual(dimensionDrift.normalization, published.normalization);
});
