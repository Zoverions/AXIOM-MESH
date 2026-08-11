import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeContextProjectionAuthority,
  deriveContextProjectionAuthority,
  encodeContextProjectionAuthority
} from '../src/lib/context-authority.mjs';

test('context authority survives a bounded canonical base64url round trip', () => {
  const authority = deriveContextProjectionAuthority({
    id: 'person:operator',
    type: 'human',
    roles: ['operator'],
    scopes: ['context:profile', 'context:project']
  }, { purpose: 'project.execution' });
  const encoded = encodeContextProjectionAuthority(authority);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.ok(encoded.length <= 4096);
  assert.deepEqual(decodeContextProjectionAuthority(encoded), authority);
});

test('authority envelope rejects digest tampering', () => {
  const authority = deriveContextProjectionAuthority({
    id: 'person:operator',
    type: 'human',
    roles: [],
    scopes: ['context:project']
  }, { purpose: 'project.execution' });
  const tampered = {
    ...authority,
    purpose: 'personal.profile'
  };
  const encoded = Buffer.from(JSON.stringify(tampered), 'utf8').toString('base64url');
  assert.throws(
    () => decodeContextProjectionAuthority(encoded),
    /authority digest is invalid/
  );
});

test('wildcard authority envelope carries no wildcard or predeclared finite scope', () => {
  const authority = deriveContextProjectionAuthority({
    id: 'local-operator',
    type: 'human',
    roles: ['administrator'],
    scopes: ['*']
  }, { purpose: 'project.execution' });
  const decoded = decodeContextProjectionAuthority(
    encodeContextProjectionAuthority(authority)
  );
  assert.deepEqual(decoded.context_scopes, []);
  assert.equal(
    decoded.scope_mode,
    'authenticated-wildcard-to-finite-visible-scopes'
  );
  assert.ok(!JSON.stringify(decoded).includes('"*"'));
});

test('machine authority envelope requires machine authority digest binding', () => {
  const authority = deriveContextProjectionAuthority({
    schema: 'axiom-machine-principal.v1',
    id: 'agent:planner',
    type: 'agent',
    scopes: ['context:project'],
    constraints: { purposes: ['project.execution'] }
  }, { purpose: 'project.execution' });
  assert.throws(
    () => encodeContextProjectionAuthority(authority),
    /requires its machine authority digest/
  );
});
