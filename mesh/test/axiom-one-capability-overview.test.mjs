import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appUrl = new URL('../../apps/axiom-one/app.mjs', import.meta.url);

const IMPLEMENTATION_BOUNDARY = 'Implemented means the Mesh registry supports the capability; it does not mean this principal is authorized to execute it.';
const AUTHORITY_BOUNDARY = 'Authority is evaluated separately through the normal intent and policy path.';

test('AXIOM One overview presents capability parity without granting authority', async () => {
  const source = await readFile(appUrl, 'utf8');

  assert.match(source, /projectCapabilityParity/);
  assert.match(source, /const parity = projectCapabilityParity\(capabilities\);/);
  assert.ok(source.includes(IMPLEMENTATION_BOUNDARY));
  assert.ok(source.includes(AUTHORITY_BOUNDARY));
});
