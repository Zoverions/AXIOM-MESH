import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canonicalJson, digestObject } from '../src/lib/canonical.mjs';
import {
  AGENT_COMMONS_READONLY_REQUEST_SCHEMA,
  createAgentCommonsReadonlyLab
} from '../src/lib/agent-commons-readonly-lab.mjs';
import {
  AGENT_COMMONS_A2A_CARD_CANDIDATE_SCHEMA,
  A2A_MAINTENANCE_RELEASE,
  A2A_PROTOCOL_VERSION,
  A2A_SKILL_MAP,
  A2A_SPEC_RELEASE,
  createAgentCommonsA2aCardCandidateProjection,
  validateAgentCommonsA2aCardCandidateManifest,
  validateAgentCommonsA2aCardCandidateProjection
} from '../src/lib/agent-commons-a2a-card-candidate.mjs';

const manifestUrl = new URL('../../agent-commons/a2a-card-candidate.json', import.meta.url);
const sourceUrl = new URL('../src/lib/agent-commons-a2a-card-candidate.mjs', import.meta.url);

async function committedManifest() {
  return JSON.parse(await readFile(manifestUrl, 'utf8'));
}

test('A2A card-candidate manifest pins the 1.0 line without claiming a servable agent', async () => {
  const manifest = await committedManifest();
  const result = validateAgentCommonsA2aCardCandidateManifest(manifest);

  assert.equal(result.valid, true);
  assert.equal(result.schema, AGENT_COMMONS_A2A_CARD_CANDIDATE_SCHEMA);
  assert.equal(result.protocol_version, A2A_PROTOCOL_VERSION);
  assert.equal(result.spec_release, A2A_SPEC_RELEASE);
  assert.equal(result.maintenance_release, A2A_MAINTENANCE_RELEASE);
  assert.equal(result.agent_card_servable, false);
  assert.equal(result.agent_card_conformant, false);
  assert.equal(result.supported_interfaces_advertised, 0);
  assert.equal(result.network_listener, false);
  assert.equal(result.public_state_only, true);
  assert.equal(result.compatibility_claimed, false);
  assert.equal(result.skills, 6);
});

test('A2A card-candidate manifest rejects transport, task, authority, and compatibility elevation', async () => {
  for (const mutate of [
    manifest => { manifest.agent_card_servable = true; },
    manifest => { manifest.agent_card_conformant = true; },
    manifest => { manifest.interface_required_before_agent_card = false; },
    manifest => { manifest.supported_interfaces_advertised = 1; },
    manifest => { manifest.network_listener = true; },
    manifest => { manifest.task_operations = true; },
    manifest => { manifest.message_operations = true; },
    manifest => { manifest.streaming = true; },
    manifest => { manifest.push_notifications = true; },
    manifest => { manifest.extended_agent_card = true; },
    manifest => { manifest.security_schemes_advertised = true; },
    manifest => { manifest.public_state_only = false; },
    manifest => { manifest.private_grid_access = true; },
    manifest => { manifest.consequential_tools = true; },
    manifest => { manifest.machine_authority_mapping = true; },
    manifest => { manifest.compatibility_claimed = true; },
    manifest => { manifest.production_compatibility_claimed = true; },
    manifest => { manifest.a2a_protocol_version = '0.3'; },
    manifest => { manifest.a2a_spec_release = '0.3.0'; },
    manifest => { manifest.a2a_maintenance_release = '9.9.9'; },
    manifest => { manifest.skill_mappings[0].c0_method = 'write.anything'; }
  ]) {
    const manifest = structuredClone(await committedManifest());
    mutate(manifest);
    assert.throws(() => validateAgentCommonsA2aCardCandidateManifest(manifest));
  }
});

test('A2A projection deliberately emits no Agent Card or supported interface', async () => {
  const projection = await createAgentCommonsA2aCardCandidateProjection();

  assert.equal(projection.agent_card, null);
  assert.equal(projection.agent_card_servable, false);
  assert.equal(projection.agent_card_conformant, false);
  assert.equal(projection.interface_required_before_agent_card, true);
  assert.equal(projection.supported_interfaces_advertised, 0);
  assert.equal(projection.network_listener, false);
  assert.equal(projection.compatibility_claimed, false);
  assert.equal(projection.production_compatibility_claimed, false);
  assert.equal(Object.hasOwn(projection.card_template, 'supportedInterfaces'), false);
  assert.equal(Object.hasOwn(projection.card_template, 'url'), false);
  assert.equal(Object.hasOwn(projection.card_template, 'protocolVersion'), false);
});

test('A2A card template keeps all remote execution and authentication capabilities disabled', async () => {
  const projection = await createAgentCommonsA2aCardCandidateProjection();
  const template = projection.card_template;

  assert.deepEqual(template.capabilities, {
    streaming: false,
    pushNotifications: false,
    extendedAgentCard: false
  });
  assert.deepEqual(template.securitySchemes, {});
  assert.deepEqual(template.securityRequirements, []);
  assert.deepEqual(template.defaultInputModes, ['application/json']);
  assert.deepEqual(template.defaultOutputModes, ['application/json']);
  assert.equal(projection.task_operations, false);
  assert.equal(projection.message_operations, false);
  assert.equal(projection.private_grid_access, false);
  assert.equal(projection.consequential_tools, false);
  assert.equal(projection.machine_authority_mapping, false);
  assert.equal(projection.authority_granted, false);
});

test('A2A candidate skills are descriptive read-only mappings and never task authority', async () => {
  const projection = await createAgentCommonsA2aCardCandidateProjection();
  const skills = projection.card_template.skills;

  assert.deepEqual(skills.map(skill => skill.id), Object.keys(A2A_SKILL_MAP));
  for (const skill of skills) {
    assert.match(skill.id, /^axiom_(?:project_get|capabilities_list|challenges_list|schemas_list|verification_get|protocols_get)$/);
    assert.doesNotMatch(skill.id, /write|create|update|delete|merge|deploy|exec|task|message/);
    assert.deepEqual(skill.tags, ['axiom-mesh', 'read-only', 'public-state']);
    assert.deepEqual(skill.inputModes, ['application/json']);
    assert.deepEqual(skill.outputModes, ['application/json']);
    assert.equal(typeof skill.description, 'string');
    assert.ok(skill.description.length > 40);
  }
});

test('every A2A public-state projection is data-parity equivalent to its direct C0 method', async () => {
  const projection = await createAgentCommonsA2aCardCandidateProjection();

  for (const item of projection.public_state_projections) {
    const directLab = await createAgentCommonsReadonlyLab();
    const direct = await directLab.request({
      schema: AGENT_COMMONS_READONLY_REQUEST_SCHEMA,
      id: `direct-${item.skill_id}`,
      method: item.c0_method,
      params: {}
    });

    assert.equal(item.response.method, item.c0_method);
    assert.deepEqual(item.response.data, direct.data);
  }
});

test('A2A projection remains deterministic and content-addressed', async () => {
  const first = await createAgentCommonsA2aCardCandidateProjection();
  const second = await createAgentCommonsA2aCardCandidateProjection();

  assert.deepEqual(first, second);
  const { digest, ...document } = first;
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(digestObject(document), digest);
  assert.equal(canonicalJson(first), canonicalJson(second));
});

test('A2A candidate projection rejects card/interface, mapping, and digest substitution', async () => {
  const base = await createAgentCommonsA2aCardCandidateProjection();

  const fakeCard = structuredClone(base);
  fakeCard.agent_card = { name: 'forged' };
  fakeCard.digest = digestObject(Object.fromEntries(Object.entries(fakeCard).filter(([key]) => key !== 'digest')));
  assert.throws(() => validateAgentCommonsA2aCardCandidateProjection(fakeCard));

  const fakeInterface = structuredClone(base);
  fakeInterface.card_template.supportedInterfaces = [{
    url: 'https://example.invalid/a2a',
    protocolBinding: 'JSONRPC',
    protocolVersion: '1.0'
  }];
  assert.throws(() => validateAgentCommonsA2aCardCandidateProjection(fakeInterface));

  const fakeAuthority = structuredClone(base);
  fakeAuthority.authority_granted = true;
  assert.throws(() => validateAgentCommonsA2aCardCandidateProjection(fakeAuthority));

  const fakeMapping = structuredClone(base);
  fakeMapping.public_state_projections[0].c0_method = 'write.anything';
  assert.throws(() => validateAgentCommonsA2aCardCandidateProjection(fakeMapping));

  const fakeDigest = structuredClone(base);
  fakeDigest.digest = '0'.repeat(64);
  assert.throws(() => validateAgentCommonsA2aCardCandidateProjection(fakeDigest));
});

test('A2A candidate output is deeply frozen against caller mutation', async () => {
  const projection = await createAgentCommonsA2aCardCandidateProjection();

  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.card_template), true);
  assert.equal(Object.isFrozen(projection.card_template.skills), true);
  assert.equal(Object.isFrozen(projection.public_state_projections), true);
  assert.throws(() => {
    projection.card_template.name = 'mutated';
  });
});

test('A2A candidate implementation imports no HTTP, socket, subprocess, Grid, or credential module', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.doesNotMatch(source, /node:(?:http|https|net|tls|dgram|child_process)/);
  assert.doesNotMatch(source, /\bcreateServer\s*\(/);
  assert.doesNotMatch(source, /\.listen\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\b(?:spawn|exec|execFile|fork)\s*\(/);
  assert.doesNotMatch(source, /\bGridStore\b/);
  assert.doesNotMatch(source, /from ['"][^'"]*(?:credential|auth|token)[^'"]*['"]/i);
});

test('A2A candidate has no write-capable or task-operation mapping', () => {
  assert.deepEqual(A2A_SKILL_MAP, {
    axiom_project_get: 'project.get',
    axiom_capabilities_list: 'capabilities.list',
    axiom_challenges_list: 'challenges.list',
    axiom_schemas_list: 'schemas.list',
    axiom_verification_get: 'verification.get',
    axiom_protocols_get: 'protocols.get'
  });
  for (const [skillId, method] of Object.entries(A2A_SKILL_MAP)) {
    assert.doesNotMatch(skillId, /write|create|update|delete|merge|deploy|exec|task|message/);
    assert.match(method, /^(?:project\.get|capabilities\.list|challenges\.list|schemas\.list|verification\.get|protocols\.get)$/);
  }
});
