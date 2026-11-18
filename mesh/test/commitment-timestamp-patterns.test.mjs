import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemas = [
  'agreement-record-v0',
  'agreement-acceptance-evidence-v0',
  'circle-artifact-mutation-admission-v0',
  'circle-commitment-admission-v0'
];

for (const name of schemas) {
  test(`${name}: serialized timestamp pattern accepts canonical UTC examples`, async () => {
    const schema = JSON.parse(await readFile(new URL(`../config/${name}.schema.json`, import.meta.url), 'utf8'));
    assert.equal(schema.$defs.date.type, 'string');
    assert.equal(schema.$defs.date.format, 'date-time');
    const pattern = new RegExp(schema.$defs.date.pattern);
    for (const timestamp of ['2026-09-24T12:00:00.000Z', '2000-02-29T23:59:59.999Z']) {
      assert.equal(new Date(timestamp).toISOString(), timestamp);
      assert.equal(pattern.test(timestamp), true, `${name} rejects ${timestamp}`);
    }
  });

  test(`${name}: timestamp shape still rejects noncanonical representations`, async () => {
    const schema = JSON.parse(await readFile(new URL(`../config/${name}.schema.json`, import.meta.url), 'utf8'));
    const pattern = new RegExp(schema.$defs.date.pattern);
    for (const timestamp of [
      '2026-09-24T12:00:00Z',
      '2026-09-24T12:00:00x000Z',
      '2026-09-24T12:00:00.000+00:00',
      '2026-09-24 12:00:00.000Z',
      String.raw`\dddd-\dd-\ddT\dd:\dd:\dd\.\dddZ`
    ]) assert.equal(pattern.test(timestamp), false, `${name} accepts ${timestamp}`);
  });
}
