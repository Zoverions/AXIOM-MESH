import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveContextProjectionAuthority,
  finiteContextScopesForClaims
} from '../src/lib/context-authority.mjs';

const MACHINE_AUTHORITY_DIGEST = 'a'.repeat(64);

test('context projection derives finite scopes from authenticated principal authority', () => {
  const authority = deriveContextProjectionAuthority({
    id: 'person:operator',
    type: 'human',
    roles: ['operator'],
    scopes: ['audit:read', 'context:project']
  }, { purpose: 'project.execution' });

  assert.equal(authority.principal_id, 'person:operator');
  assert.equal(authority.scope_mode, 'finite-authenticated-scopes');
  assert.deepEqual(authority.context_scopes, ['context:project']);
  assert.equal(authority.purpose_binding, 'authenticated-request-selector');
  assert.match(authority.authority_digest, /^[a-f0-9]{64}$/);
});

test('non-context scopes cannot be repurposed as context authority', () => {
  assert.throws(
    () => deriveContextProjectionAuthority({
      id: 'person:auditor',
      type: 'human',
      roles: ['auditor'],
      scopes: ['audit:read', 'memory:read']
    }, { purpose: 'project.execution' }),
    error => error.code === 'forbidden' && error.status === 403
  );
});

test('machine context purpose must be inside the authenticated machine constraint set', () => {
  const machine = {
    schema: 'axiom-machine-principal.v1',
    id: 'agent:planner',
    type: 'agent',
    sponsor: 'person:operator',
    scopes: ['context:project'],
    authority_digest: MACHINE_AUTHORITY_DIGEST,
    constraints: {
      purposes: ['project.execution']
    }
  };
  const allowed = deriveContextProjectionAuthority(machine, {
    purpose: 'project.execution'
  });
  assert.equal(allowed.purpose_binding, 'machine-principal-constraint');
  assert.equal(allowed.machine_authority_digest, MACHINE_AUTHORITY_DIGEST);

  assert.throws(
    () => deriveContextProjectionAuthority(machine, { purpose: 'personal.profile' }),
    error => error.code === 'machine_purpose_denied' && error.status === 403
  );
});

test('machine context authority rejects wildcard scope syntax', () => {
  assert.throws(
    () => deriveContextProjectionAuthority({
      schema: 'axiom-machine-principal.v1',
      id: 'agent:planner',
      type: 'agent',
      scopes: ['*'],
      constraints: { purposes: ['project.execution'] }
    }, { purpose: 'project.execution' }),
    /wildcard scopes/
  );
});

test('authenticated wildcard authority is reduced to finite visible context scopes', () => {
  const authority = deriveContextProjectionAuthority({
    id: 'local-operator',
    type: 'human',
    roles: ['administrator'],
    scopes: ['*']
  }, { purpose: 'project.execution' });
  assert.equal(
    authority.scope_mode,
    'authenticated-wildcard-to-finite-visible-scopes'
  );
  assert.deepEqual(authority.context_scopes, []);

  const scopes = finiteContextScopesForClaims(authority, [{
    disclosure: { scopes: ['context:project', 'context:profile'] }
  }, {
    disclosure: { scopes: ['context:project'] }
  }]);
  assert.deepEqual(scopes, ['context:profile', 'context:project']);
  assert.ok(!scopes.includes('*'));
});

test('wildcard reduction refuses non-context claim disclosure scopes', () => {
  const authority = deriveContextProjectionAuthority({
    id: 'local-operator',
    type: 'human',
    roles: ['administrator'],
    scopes: ['*']
  }, { purpose: 'project.execution' });
  assert.throws(
    () => finiteContextScopesForClaims(authority, [{
      disclosure: { scopes: ['audit:read'] }
    }]),
    /non-context disclosure scope/
  );
});
