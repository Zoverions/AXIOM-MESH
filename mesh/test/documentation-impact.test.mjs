import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertDocumentationImpact,
  evaluateDocumentationImpact,
  validateDocumentationImpactPolicy
} from '../src/check-documentation-impact.mjs';

test('documentation impact policy is valid and digest-bound', () => {
  const result = validateDocumentationImpactPolicy();
  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-documentation-impact-policy.v1');
  assert.ok(result.rules >= 5);
  assert.match(result.policy_digest, /^[a-f0-9]{64}$/);
});

test('host installer changes require operations, public-entry, and roadmap/status documentation', () => {
  const result = evaluateDocumentationImpact([
    'mesh/src/lib/host-install-plan.mjs',
    'docs/operations/HOST-INSTALLATION-PROFILES.md',
    'README.md',
    'docs/MASTER-TODO.md'
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.triggered_rule_count, 1);
  assert.equal(result.triggered_rules[0].id, 'host-install-surface');
  assert.deepEqual(
    result.triggered_rules[0].required_groups.map(group => group.satisfied),
    [true, true, true]
  );
});

test('host installer implementation without public documentation fails closed', () => {
  assert.throws(
    () => assertDocumentationImpact([
      'mesh/src/host-install.mjs',
      'docs/operations/HOST-INSTALLATION-PROFILES.md'
    ]),
    /host-install-surface\/public-entry/
  );
});

test('Education contract changes require downstream-model and current-state review', () => {
  const result = evaluateDocumentationImpact([
    'mesh/config/domain-contracts/education-learner-memory.v1.json',
    'docs/rebuild/APPLICATION-AND-DOWNSTREAM-INTEGRATION.md',
    'docs/PROJECT-STATUS-2026.md'
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.triggered_rules[0].id, 'education-consumed-mesh-surface');
});

test('service-network policy changes cannot omit their network runbook', () => {
  const result = evaluateDocumentationImpact([
    'mesh/src/lib/service-network-policy.mjs',
    'mesh/PRODUCTION.md'
  ]);
  assert.equal(result.valid, false);
  assert.deepEqual(result.violations, [{
    rule_id: 'service-network-policy',
    group_id: 'network-runbook',
    any_of: ['docs/operations/EXPLICIT-SERVICE-NETWORK-POLICY.md']
  }]);
});

test('capability changes require current-state plus requirements or white-paper review', () => {
  assert.equal(assertDocumentationImpact([
    'mesh/config/capabilities.json',
    'README.md',
    'docs/whitepapers_and_research/WHITEPAPER.md'
  ]).valid, true);
  assert.throws(
    () => assertDocumentationImpact([
      'mesh/config/capabilities.json',
      'README.md'
    ]),
    /capability-status\/requirements-or-whitepaper/
  );
});

test('unrelated test-only changes do not manufacture a documentation requirement', () => {
  const result = evaluateDocumentationImpact(['mesh/test/canonical.test.mjs']);
  assert.equal(result.valid, true);
  assert.equal(result.triggered_rule_count, 0);
  assert.deepEqual(result.violations, []);
});

test('path normalization is deterministic and rejects traversal-like inventory', () => {
  const result = evaluateDocumentationImpact([
    './README.md',
    'README.md',
    'mesh/config/application-catalog.json',
    'docs/rebuild/APPLICATION-AND-DOWNSTREAM-INTEGRATION.md'
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.changed_path_count, 3);
  assert.throws(
    () => evaluateDocumentationImpact(['../README.md']),
    /invalid repository path/
  );
});
