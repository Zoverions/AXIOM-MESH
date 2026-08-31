import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCircleCorePackage } from '../src/lib/circle-core.mjs';
import { executeSandboxBuiltin } from '../src/sandbox/education-executor.mjs';

const PRINCIPAL = Object.freeze({
  id: 'principal-circle-owner',
  type: 'human',
  roles: [],
  scopes: ['circle:write']
});

function execute(action, input = {}) {
  return executeSandboxBuiltin({
    tool: 'builtin.validate-mutation',
    assurance: {
      required: 'A2',
      achieved: 'A2',
      basis: 'auditable_kernel_path'
    },
    intent: {
      action,
      input,
      principal: PRINCIPAL
    }
  });
}

test('circle.create constructs an inert bootstrap Circle Core package', () => {
  const created = execute('circle.create', {
    name: 'Research Circle',
    purpose: 'Coordinate a bounded local research collaboration.',
    participation_model: 'voluntary'
  });

  assert.equal(created.output.network_effect, 'none');
  assert.equal(created.output.authority_effect, 'none');
  assert.equal(created.output.runtime_activation, false);
  assert.equal(created.mutation.kind, 'circle.local.created');
  assert.equal(created.mutation.payload.owner, PRINCIPAL.id);

  const document = created.mutation.payload.package;
  const result = validateCircleCorePackage(document);

  assert.equal(result.valid, true);
  assert.equal(result.circle_id, created.output.circle_id);
  assert.equal(document.circle.created_by, PRINCIPAL.id);
  assert.equal(document.circle.member_state_ownership, 'independent-node');
  assert.equal(document.circle.policy_floor, 'raise-only');
  assert.equal(document.charter.execution_authority, false);
  assert.equal(document.charter.authority_effect, 'none');
  assert.deepEqual(
    document.charter.roles.map(role => role.role_id),
    ['steward', 'member', 'observer']
  );
  assert.ok(document.charter.roles.every(role => role.execution_authority === false));
  assert.equal(document.invitations.length, 1);
  assert.equal(document.invitations[0].invited_principal, PRINCIPAL.id);
  assert.deepEqual(document.invitations[0].role_ids, ['steward']);
  assert.equal(document.invitations[0].one_use, true);
  assert.equal(document.memberships.length, 1);
  assert.equal(document.memberships[0].principal_id, PRINCIPAL.id);
  assert.deepEqual(document.memberships[0].role_ids, ['steward']);
  assert.equal(document.memberships[0].status, 'active');
  assert.equal(document.proposals.length, 0);
  assert.equal(document.tasks.length, 0);
  assert.equal(document.decisions.length, 0);
  assert.equal(document.appeals.length, 0);
  assert.equal(document.exits.length, 0);
  assert.equal(document.exports.length, 0);
  assert.equal(document.authority_effect, 'none');
  assert.equal(document.network_effect, 'none');
  assert.equal(document.runtime_activation, false);
});
