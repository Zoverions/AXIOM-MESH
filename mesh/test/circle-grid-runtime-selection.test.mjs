import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { AcceptedSocialGridStore } from '../src/grid/accepted-social-store.mjs';
import { CircleGridStore } from '../src/grid/circle-store.mjs';

test('live Grid composition selects CircleGridStore without bypassing accepted Social storage', async () => {
  assert.equal(
    Object.getPrototypeOf(CircleGridStore.prototype),
    AcceptedSocialGridStore.prototype,
    'CircleGridStore must extend the accepted Social storage stack directly'
  );

  const source = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ CircleGridStore \} from '\.\/circle-store\.mjs';/);
  assert.match(source, /new CircleGridStore\s*\(/);
  assert.equal(
    source.includes("import { AcceptedSocialGridStore } from './accepted-social-store.mjs';"),
    false
  );
  assert.equal(source.includes('new AcceptedSocialGridStore('), false);
  assert.equal(source.includes('AXIOM_CIRCLE'), false);
});
