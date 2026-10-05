import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

async function text(path) {
  return readFile(resolve(repositoryRoot, path), 'utf8');
}

test('agent participation bootstrap matches the supported machine-principal boundary', async () => {
  const [manifestRaw, discoveryRaw, guide, llms, machinePrincipalSource] = await Promise.all([
    text('agent-readiness/PARTICIPATION.json'),
    text('agent-discovery.json'),
    text('agent-readiness/AGENT-PARTICIPATION.txt'),
    text('llms.txt'),
    text('mesh/src/lib/machine-principal.mjs')
  ]);

  const manifest = JSON.parse(manifestRaw);
  const discovery = JSON.parse(discoveryRaw);

  assert.equal(manifest.schema, 'axiom-agent-participation.v1');
  assert.equal(manifest.supported_build, '0.12.0-dev.3');
  assert.equal(
    manifest.status,
    'repository_and_local_conformance_available_external_autonomous_execution_not_promoted'
  );

  const tiers = new Map(manifest.participation_tiers.map((tier) => [tier.id, tier]));
  assert.equal(tiers.get('external-review')?.available_now, true);
  assert.equal(tiers.get('local-conformance-agent')?.available_now, true);
  assert.equal(tiers.get('configured-local-machine-principal')?.available_now, true);
  assert.equal(tiers.get('configured-local-machine-principal')?.self_service_external_onboarding, false);
  assert.equal(tiers.get('configured-local-machine-principal')?.delegation_allowed, false);
  assert.equal(tiers.get('portable-external-agent')?.available_now, false);
  assert.equal(tiers.get('community-governance-agent')?.available_now, false);

  assert.equal(
    discovery.community.participation_manifest,
    'agent-readiness/PARTICIPATION.json'
  );
  assert.equal(
    discovery.community.participation_guide,
    'agent-readiness/AGENT-PARTICIPATION.txt'
  );

  assert.match(llms, /agent-readiness\/PARTICIPATION\.json/);
  assert.match(llms, /agent-readiness\/AGENT-PARTICIPATION\.txt/);

  assert.match(guide, /configured human sponsor/i);
  assert.match(guide, /cannot delegate authority/i);
  assert.match(guide, /GitHub remains the canonical repository authority surface/i);
  assert.match(guide, /npm run check/);
  assert.match(guide, /machine-principal-e2e\.test\.mjs/);
  assert.match(guide, /Automation must not silently become authority/i);

  assert.match(machinePrincipalSource, /knownHumanPrincipals/);
  assert.match(machinePrincipalSource, /Machine principal sponsor must resolve to a known human principal/);
  assert.match(machinePrincipalSource, /Machine principal v1 does not permit delegation/);

  const safeAutomation = manifest.automation_boundary.safe_to_automate_without_operator_effect_approval.join('\n');
  const gatedEffects = manifest.automation_boundary.separate_explicit_authority_required.join('\n');
  assert.match(safeAutomation, /static analysis and bounded security review/i);
  assert.match(safeAutomation, /patch proposal and pull-request creation/i);
  assert.match(safeAutomation, /protected CI verification/i);
  assert.match(gatedEffects, /merge/i);
  assert.match(gatedEffects, /deployment or publication/i);
  assert.match(gatedEffects, /credential or secret access/i);
  assert.match(gatedEffects, /production promotion/i);
  assert.match(gatedEffects, /testing third-party systems without explicit authorization/i);

  assert.equal(
    manifest.future_governance_direction.must_preserve.includes(
      'no self-granting authority by models, agents, adapters, or governance automation'
    ),
    true
  );
});
