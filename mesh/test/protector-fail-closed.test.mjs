import assert from 'node:assert/strict';
import test from 'node:test';

import { DataProtector } from '../src/lib/protector.mjs';

const KEY = Buffer.alloc(32, 7);
const CONTEXT = 'axiom:test:protector-fail-closed';

test('DataProtector.open always rejects plaintext/legacy JSON even when a downgrade option is supplied', () => {
  const protector = new DataProtector(KEY);
  const plaintext = JSON.stringify({ legacy: true, secret: 'must-not-open' });

  assert.throws(
    () => protector.open(plaintext, CONTEXT),
    /unsupported format/
  );
  // JavaScript permits extra arguments. Prove the former allowPlaintext escape
  // hatch is gone semantically as well as syntactically.
  assert.throws(
    () => protector.open(plaintext, CONTEXT, { allowPlaintext: true }),
    /unsupported format/
  );
});

test('DataProtector.open still round-trips authenticated protected values', () => {
  const protector = new DataProtector(KEY);
  const value = { protected: true, nested: { count: 3 } };
  const sealed = protector.seal(value, CONTEXT);
  assert.deepEqual(protector.open(sealed, CONTEXT), value);
});
