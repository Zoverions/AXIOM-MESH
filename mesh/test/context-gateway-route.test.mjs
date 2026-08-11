import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGatewayContextProjection } from '../src/gateway/context-route.mjs';
import { decodeContextProjectionAuthority } from '../src/lib/context-authority.mjs';

const NOW = '2026-08-11T20:00:00.000Z';

function principal() {
  return {
    id: 'person:context-owner',
    type: 'human',
    roles: ['operator'],
    scopes: ['context:project']
  };
}

test('Gateway context request derives signed Grid target solely from authenticated principal', () => {
  const result = buildGatewayContextProjection({
    gridUrl: 'http://127.0.0.1:8083',
    principal: principal(),
    url: new URL('http://gateway.invalid/v1/context?purpose=project.execution&max_claims=12'),
    now: NOW
  });
  const target = new URL(result.target);
  assert.equal(target.pathname, '/internal/v1/memory/person%3Acontext-owner');
  assert.equal(target.searchParams.get('requester'), 'person:context-owner');
  assert.equal(target.searchParams.get('projection'), 'context');
  assert.equal(target.searchParams.get('max_claims'), '12');
  assert.equal(target.searchParams.get('as_of'), NOW);
  assert.equal(target.searchParams.has('scopes'), false);
  const authority = decodeContextProjectionAuthority(
    target.searchParams.get('authority')
  );
  assert.equal(authority.principal_id, 'person:context-owner');
  assert.equal(authority.purpose, 'project.execution');
  assert.deepEqual(authority.context_scopes, ['context:project']);
});

test('Gateway context request refuses caller-provided scope or principal parameters', () => {
  for (const query of [
    'purpose=project.execution&scopes=context%3Arestricted',
    'purpose=project.execution&principal=person%3Aother',
    'purpose=project.execution&authorized_scopes=context%3Arestricted'
  ]) {
    assert.throws(
      () => buildGatewayContextProjection({
        gridUrl: 'http://127.0.0.1:8083',
        principal: principal(),
        url: new URL(`http://gateway.invalid/v1/context?${query}`),
        now: NOW
      }),
      /Unsupported context query parameter/
    );
  }
});

test('Gateway context request requires an explicit purpose', () => {
  assert.throws(
    () => buildGatewayContextProjection({
      gridUrl: 'http://127.0.0.1:8083',
      principal: principal(),
      url: new URL('http://gateway.invalid/v1/context'),
      now: NOW
    }),
    /purpose/
  );
});

test('Gateway context request enforces machine purpose before contacting Grid', () => {
  assert.throws(
    () => buildGatewayContextProjection({
      gridUrl: 'http://127.0.0.1:8083',
      principal: {
        schema: 'axiom-machine-principal.v1',
        id: 'agent:planner',
        type: 'agent',
        scopes: ['context:project'],
        authority_digest: 'a'.repeat(64),
        constraints: { purposes: ['project.execution'] }
      },
      url: new URL('http://gateway.invalid/v1/context?purpose=personal.profile'),
      now: NOW
    }),
    error => error.code === 'machine_purpose_denied' && error.status === 403
  );
});
