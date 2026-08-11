import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildContextProjectionRequest,
  normalizeContextProjectionRequest
} from '../src/lib/context-projection-request.mjs';

const AS_OF = '2026-08-11T20:00:00.000Z';

function humanPrincipal() {
  return {
    id: 'person:context-owner',
    type: 'human',
    roles: ['operator'],
    scopes: ['context:project']
  };
}

test('projection request is derived from authenticated principal and has no caller scope field', () => {
  const built = buildContextProjectionRequest({
    principal: humanPrincipal(),
    purpose: 'project.execution',
    asOf: AS_OF,
    maxClaims: 32
  });

  assert.equal(built.request.schema, 'axiom-context-projection-request.v1');
  assert.equal(built.request.owner, 'person:context-owner');
  assert.equal(built.request.principal.id, 'person:context-owner');
  assert.equal(built.request.purpose, 'project.execution');
  assert.equal(built.request.max_claims, 32);
  assert.ok(!Object.hasOwn(built.request, 'scopes'));
  assert.ok(!Object.hasOwn(built.request, 'authorized_scopes'));
  assert.match(built.request_digest, /^[a-f0-9]{64}$/);
  assert.match(built.authority_digest, /^[a-f0-9]{64}$/);
});

test('projection request rejects undeclared scope injection', () => {
  const request = buildContextProjectionRequest({
    principal: humanPrincipal(),
    purpose: 'project.execution',
    asOf: AS_OF
  }).request;

  assert.throws(
    () => normalizeContextProjectionRequest({
      ...request,
      scopes: ['context:restricted']
    }),
    /fields are invalid/
  );
  assert.throws(
    () => normalizeContextProjectionRequest({
      ...request,
      authorized_scopes: ['context:restricted']
    }),
    /fields are invalid/
  );
});

test('projection request requires explicit purpose and finite max_claims', () => {
  assert.throws(
    () => buildContextProjectionRequest({
      principal: humanPrincipal(),
      purpose: undefined,
      asOf: AS_OF
    }),
    /purpose/
  );

  assert.throws(
    () => buildContextProjectionRequest({
      principal: humanPrincipal(),
      purpose: 'project.execution',
      asOf: AS_OF,
      maxClaims: 257
    }),
    /max_claims/
  );
});

test('receiving boundary rechecks machine purpose authority', () => {
  const machine = {
    schema: 'axiom-machine-principal.v1',
    id: 'agent:planner',
    type: 'agent',
    sponsor: 'person:context-owner',
    scopes: ['context:project'],
    authority_digest: 'a'.repeat(64),
    constraints: {
      purposes: ['project.execution']
    }
  };
  const request = {
    schema: 'axiom-context-projection-request.v1',
    principal: machine,
    owner: 'person:context-owner',
    purpose: 'personal.profile',
    as_of: AS_OF,
    max_claims: 64
  };

  assert.throws(
    () => normalizeContextProjectionRequest(request),
    error => error.code === 'machine_purpose_denied' && error.status === 403
  );
});
