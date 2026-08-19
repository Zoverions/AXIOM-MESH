import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const expectedLaneIds = [
  'review-falsification',
  'implementation-pr',
  'interoperability-adapter',
  'hardware-validation',
  'infrastructure-validation',
  'claim-audit',
  'benchmark-compatibility'
];

async function text(path) {
  return readFile(resolve(repositoryRoot, path), 'utf8');
}

function issueFormFieldBlock(source, id) {
  const blocks = source.split(/(?=^[ \t]*-[ \t]+type:[ \t]*)/m);
  const idPattern = new RegExp(`^[ \\t]+id:[ \\t]*${id}[ \\t]*$`, 'm');
  return blocks.find((block) => idPattern.test(block)) ?? null;
}

test('agent contribution lanes stay bounded, discoverable, and authority-safe', async () => {
  const [lanesRaw, discoveryRaw, llms, issueForm] = await Promise.all([
    text('agent-readiness/contributions.json'),
    text('agent-discovery.json'),
    text('llms.txt'),
    text('.github/ISSUE_TEMPLATE/agent-contribution-proposal.yml')
  ]);

  const lanes = JSON.parse(lanesRaw);
  const discovery = JSON.parse(discoveryRaw);

  assert.equal(lanes.schema, 'axiom-agent-contribution-lanes.v1');
  assert.equal(lanes.supported_build, '0.12.0-dev.3');
  assert.equal(lanes.status, 'repository_contribution_lanes_not_runtime_authority');

  assert.equal(lanes.safety.public_non_sensitive_only, true);
  assert.equal(lanes.safety.third_party_testing_authorized, false);
  assert.equal(lanes.safety.production_deployment_authorized, false);
  assert.equal(lanes.safety.merge_authority_granted, false);
  assert.equal(lanes.safety.credential_sharing_requested, false);
  assert.equal(lanes.safety.spending_or_purchase_authorized, false);
  assert.equal(lanes.safety.shipping_or_hardware_transfer_authorized, false);

  assert.equal(
    discovery.community.contribution_lanes,
    'agent-readiness/contributions.json'
  );
  assert.equal(
    discovery.community.contribution_proposal_template,
    '.github/ISSUE_TEMPLATE/agent-contribution-proposal.yml'
  );
  assert.equal(
    discovery.community.contribution_new_issue_url,
    'https://github.com/Zoverions/AXIOM-MESH/issues/new?template=agent-contribution-proposal.yml'
  );
  assert.match(llms, /agent-readiness\/contributions\.json/);
  assert.match(llms, /agent-contribution-proposal\.yml/);

  assert.deepEqual(lanes.lanes.map((lane) => lane.id), expectedLaneIds);
  assert.equal(new Set(lanes.lanes.map((lane) => lane.id)).size, lanes.lanes.length);

  for (const lane of lanes.lanes) {
    assert.equal(typeof lane.title, 'string');
    assert.equal(typeof lane.purpose, 'string');
    assert.equal(typeof lane.default_effect_boundary, 'string');
    assert.ok(Array.isArray(lane.required_evidence));
    assert.ok(lane.required_evidence.length >= 2);
    assert.ok(lane.required_evidence.every((item) => typeof item === 'string' && item.length > 0));
  }

  const hardwareLane = lanes.lanes.find((lane) => lane.id === 'hardware-validation');
  const infrastructureLane = lanes.lanes.find((lane) => lane.id === 'infrastructure-validation');
  assert.ok(hardwareLane, 'hardware-validation lane must exist');
  assert.ok(infrastructureLane, 'infrastructure-validation lane must exist');
  assert.match(hardwareLane.purpose, /contributor-owned or explicitly disposable hardware/i);
  assert.match(hardwareLane.default_effect_boundary, /no purchasing, shipping, credential provisioning, or production deployment authority/i);
  assert.match(infrastructureLane.purpose, /contributor-owned or explicitly disposable infrastructure/i);
  assert.match(infrastructureLane.default_effect_boundary, /no production deployment/i);

  assert.ok(Array.isArray(lanes.operator_approval_required_for));
  const requiredApprovals = lanes.operator_approval_required_for.join('\n');
  assert.match(requiredApprovals, /merging repository changes/i);
  assert.match(requiredApprovals, /deploying or publishing/i);
  assert.match(requiredApprovals, /spending money or purchasing equipment/i);
  assert.match(requiredApprovals, /shipping, receiving, or transferring hardware/i);
  assert.match(requiredApprovals, /testing systems not owned by the contributor/i);

  const laneField = issueFormFieldBlock(issueForm, 'contribution_lane');
  assert.ok(laneField, 'issue form must expose contribution_lane');
  assert.match(laneField, /required:\s*true/);
  assert.match(laneField, /Other bounded contribution/);

  let previousOptionIndex = -1;
  for (const lane of lanes.lanes) {
    const optionIndex = laneField.indexOf(`${lane.id} - ${lane.title}`);
    assert.ok(optionIndex > previousOptionIndex, `contribution_lane must contain ${lane.id} in lane order`);
    previousOptionIndex = optionIndex;
  }

  assert.match(issueForm, /does not grant merge, runtime, deployment, protocol, production-promotion, credential, purchase, shipping, or third-party-testing authority/i);
  assert.match(issueForm, /not treating this proposal as authority to test third-party systems or infrastructure/i);
  assert.match(issueForm, /merge, deployment, protocol activation, credential access, purchases, shipping, and production promotion require separate explicit authorization/i);

  const nonclaims = lanes.nonclaims.join('\n');
  assert.match(nonclaims, /not permission to execute AXIOM-MESH effects/i);
  assert.match(nonclaims, /do not authorize third-party testing, purchases, shipping, credential exchange, or production deployment/i);
  assert.match(nonclaims, /not a security certification or production-promotion decision/i);
});
