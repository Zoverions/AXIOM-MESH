import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, digestObject, ValidationError } from './canonical.mjs';
import {
  AGENT_COMMONS_READONLY_REQUEST_SCHEMA,
  createAgentCommonsReadonlyLab,
  validateAgentCommonsReadonlyResponse
} from './agent-commons-readonly-lab.mjs';

export const AGENT_COMMONS_A2A_CARD_CANDIDATE_SCHEMA = 'axiom-agent-commons-a2a-card-candidate.v1';
export const A2A_PROTOCOL_VERSION = '1.0';
export const A2A_SPEC_RELEASE = '1.0.0';
export const A2A_MAINTENANCE_RELEASE = '1.0.1';

export const A2A_SKILL_MAP = Object.freeze({
  axiom_project_get: 'project.get',
  axiom_capabilities_list: 'capabilities.list',
  axiom_challenges_list: 'challenges.list',
  axiom_schemas_list: 'schemas.list',
  axiom_verification_get: 'verification.get',
  axiom_protocols_get: 'protocols.get'
});

const PROJECT = 'AXIOM-MESH';
const SUPPORTED_BUILD = '0.12.0-dev.3';
const CANONICAL_REPOSITORY = 'Zoverions/AXIOM-MESH';
const LABORATORY_BASE_SHA = 'ff5539660a960e790d1e9db14232bd1fc6e03d0a';
const SPEC_SOURCE = 'https://a2a-protocol.org/v1.0.0/specification';
const MANIFEST_PATH = resolve(
  fileURLToPath(new URL('../../..', import.meta.url)),
  'agent-commons',
  'a2a-card-candidate.json'
);
const MANIFEST_MAX_BYTES = 65_536;
const LIMITS = Object.freeze({
  max_projection_bytes: 131_072,
  max_skills: 6
});

const SKILL_DEFINITIONS = Object.freeze([
  skillDefinition(
    'axiom_project_get',
    'AXIOM public project state',
    'Describes bounded public AXIOM-MESH project identity and explicit non-authority state.'
  ),
  skillDefinition(
    'axiom_capabilities_list',
    'AXIOM public capability status',
    'Describes public capability ids, families, statuses, counts, and the validated registry digest.'
  ),
  skillDefinition(
    'axiom_challenges_list',
    'AXIOM public challenges',
    'Describes open public Agent Commons challenges from the validated discovery-only registry.'
  ),
  skillDefinition(
    'axiom_schemas_list',
    'AXIOM public schema inventory',
    'Describes the fixed public schema inventory with byte counts and SHA-256 content hashes.'
  ),
  skillDefinition(
    'axiom_verification_get',
    'AXIOM public verification instructions',
    'Describes bounded public verification commands and explicit external-validation non-claims.'
  ),
  skillDefinition(
    'axiom_protocols_get',
    'AXIOM protocol reference status',
    'Describes candidate protocol references and explicit compatibility non-claims.'
  )
]);

export function validateAgentCommonsA2aCardCandidateManifest(manifest) {
  exactKeys(manifest, 'Agent Commons A2A card-candidate manifest', [
    'schema',
    'version',
    'project',
    'supported_build',
    'canonical_repository',
    'laboratory_base_sha',
    'a2a_protocol_version',
    'a2a_spec_release',
    'a2a_maintenance_release',
    'spec_source',
    'projection_kind',
    'agent_card_servable',
    'agent_card_conformant',
    'interface_required_before_agent_card',
    'supported_interfaces_advertised',
    'network_listener',
    'task_operations',
    'message_operations',
    'streaming',
    'push_notifications',
    'extended_agent_card',
    'security_schemes_advertised',
    'public_state_only',
    'private_grid_access',
    'consequential_tools',
    'machine_authority_mapping',
    'compatibility_claimed',
    'production_compatibility_claimed',
    'skill_mappings',
    'limits',
    'claim_boundary'
  ]);

  if (
    manifest.schema !== AGENT_COMMONS_A2A_CARD_CANDIDATE_SCHEMA
    || manifest.version !== 1
    || manifest.project !== PROJECT
    || manifest.supported_build !== SUPPORTED_BUILD
    || manifest.canonical_repository !== CANONICAL_REPOSITORY
    || manifest.laboratory_base_sha !== LABORATORY_BASE_SHA
    || manifest.a2a_protocol_version !== A2A_PROTOCOL_VERSION
    || manifest.a2a_spec_release !== A2A_SPEC_RELEASE
    || manifest.a2a_maintenance_release !== A2A_MAINTENANCE_RELEASE
    || manifest.spec_source !== SPEC_SOURCE
    || manifest.projection_kind !== 'offline-agent-card-candidate'
  ) {
    throw new ValidationError('Agent Commons A2A card-candidate identity is invalid');
  }

  if (
    manifest.agent_card_servable !== false
    || manifest.agent_card_conformant !== false
    || manifest.interface_required_before_agent_card !== true
    || manifest.supported_interfaces_advertised !== 0
    || manifest.network_listener !== false
    || manifest.task_operations !== false
    || manifest.message_operations !== false
    || manifest.streaming !== false
    || manifest.push_notifications !== false
    || manifest.extended_agent_card !== false
    || manifest.security_schemes_advertised !== false
    || manifest.public_state_only !== true
    || manifest.private_grid_access !== false
    || manifest.consequential_tools !== false
    || manifest.machine_authority_mapping !== false
    || manifest.compatibility_claimed !== false
    || manifest.production_compatibility_claimed !== false
  ) {
    throw new ValidationError('Agent Commons A2A card-candidate authority/transport boundary is invalid');
  }

  if (!Array.isArray(manifest.skill_mappings) || manifest.skill_mappings.length !== SKILL_DEFINITIONS.length) {
    throw new ValidationError('Agent Commons A2A skill mappings are invalid');
  }
  for (let index = 0; index < manifest.skill_mappings.length; index += 1) {
    const actual = manifest.skill_mappings[index];
    const expected = SKILL_DEFINITIONS[index];
    exactKeys(actual, `Agent Commons A2A skill mapping ${index}`, ['id', 'c0_method']);
    if (actual.id !== expected.id || actual.c0_method !== A2A_SKILL_MAP[expected.id]) {
      throw new ValidationError('Agent Commons A2A skill mapping drifted');
    }
  }

  exactKeys(manifest.limits, 'Agent Commons A2A limits', Object.keys(LIMITS));
  for (const [key, expected] of Object.entries(LIMITS)) {
    if (manifest.limits[key] !== expected) {
      throw new ValidationError(`Agent Commons A2A limit ${key} is invalid`);
    }
  }

  if (
    typeof manifest.claim_boundary !== 'string'
    || manifest.claim_boundary.length < 160
    || !manifest.claim_boundary.includes('no servable Agent Card')
    || !manifest.claim_boundary.includes('no network listener')
    || !manifest.claim_boundary.includes('no A2A compatibility')
  ) {
    throw new ValidationError('Agent Commons A2A claim boundary is invalid');
  }

  return Object.freeze({
    valid: true,
    schema: manifest.schema,
    protocol_version: manifest.a2a_protocol_version,
    spec_release: manifest.a2a_spec_release,
    maintenance_release: manifest.a2a_maintenance_release,
    agent_card_servable: false,
    agent_card_conformant: false,
    supported_interfaces_advertised: 0,
    network_listener: false,
    public_state_only: true,
    compatibility_claimed: false,
    skills: manifest.skill_mappings.length
  });
}

export async function createAgentCommonsA2aCardCandidateProjection() {
  const manifest = await loadManifest();
  validateAgentCommonsA2aCardCandidateManifest(manifest);

  const lab = await createAgentCommonsReadonlyLab();
  const publicStateProjections = [];
  for (let index = 0; index < manifest.skill_mappings.length; index += 1) {
    const mapping = manifest.skill_mappings[index];
    const response = await lab.request({
      schema: AGENT_COMMONS_READONLY_REQUEST_SCHEMA,
      id: `a2a-${index}-${mapping.id}`,
      method: mapping.c0_method,
      params: {}
    });
    validateAgentCommonsReadonlyResponse(response);
    publicStateProjections.push({
      skill_id: mapping.id,
      c0_method: mapping.c0_method,
      response
    });
  }

  const cardTemplate = {
    name: 'AXIOM-MESH Agent Commons Read-Only Candidate',
    description: 'Offline public-state projection template only. It is not a servable A2A Agent Card and grants no AXIOM authority.',
    version: SUPPORTED_BUILD,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false
    },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: SKILL_DEFINITIONS.map(item => structuredClone(item))
  };

  const document = {
    schema: AGENT_COMMONS_A2A_CARD_CANDIDATE_SCHEMA,
    project: PROJECT,
    supported_build: SUPPORTED_BUILD,
    canonical_repository: CANONICAL_REPOSITORY,
    laboratory_base_sha: LABORATORY_BASE_SHA,
    a2a_protocol_version: A2A_PROTOCOL_VERSION,
    a2a_spec_release: A2A_SPEC_RELEASE,
    a2a_maintenance_release: A2A_MAINTENANCE_RELEASE,
    spec_source: SPEC_SOURCE,
    projection_kind: 'offline-agent-card-candidate',
    agent_card: null,
    agent_card_servable: false,
    agent_card_conformant: false,
    interface_required_before_agent_card: true,
    supported_interfaces_advertised: 0,
    network_listener: false,
    task_operations: false,
    message_operations: false,
    public_state_only: true,
    private_grid_access: false,
    consequential_tools: false,
    machine_authority_mapping: false,
    authority_granted: false,
    compatibility_claimed: false,
    production_compatibility_claimed: false,
    card_template: cardTemplate,
    public_state_projections: publicStateProjections
  };

  const encoded = canonicalJson(document);
  if (Buffer.byteLength(encoded, 'utf8') > LIMITS.max_projection_bytes) {
    throw new ValidationError('Agent Commons A2A card-candidate projection exceeds its bound');
  }

  const projection = {
    ...document,
    digest: digestObject(document)
  };
  validateAgentCommonsA2aCardCandidateProjection(projection);
  return deepFreeze(projection);
}

export function validateAgentCommonsA2aCardCandidateProjection(projection) {
  exactKeys(projection, 'Agent Commons A2A card-candidate projection', [
    'schema',
    'project',
    'supported_build',
    'canonical_repository',
    'laboratory_base_sha',
    'a2a_protocol_version',
    'a2a_spec_release',
    'a2a_maintenance_release',
    'spec_source',
    'projection_kind',
    'agent_card',
    'agent_card_servable',
    'agent_card_conformant',
    'interface_required_before_agent_card',
    'supported_interfaces_advertised',
    'network_listener',
    'task_operations',
    'message_operations',
    'public_state_only',
    'private_grid_access',
    'consequential_tools',
    'machine_authority_mapping',
    'authority_granted',
    'compatibility_claimed',
    'production_compatibility_claimed',
    'card_template',
    'public_state_projections',
    'digest'
  ]);

  if (
    projection.schema !== AGENT_COMMONS_A2A_CARD_CANDIDATE_SCHEMA
    || projection.project !== PROJECT
    || projection.supported_build !== SUPPORTED_BUILD
    || projection.canonical_repository !== CANONICAL_REPOSITORY
    || projection.laboratory_base_sha !== LABORATORY_BASE_SHA
    || projection.a2a_protocol_version !== A2A_PROTOCOL_VERSION
    || projection.a2a_spec_release !== A2A_SPEC_RELEASE
    || projection.a2a_maintenance_release !== A2A_MAINTENANCE_RELEASE
    || projection.spec_source !== SPEC_SOURCE
    || projection.projection_kind !== 'offline-agent-card-candidate'
  ) {
    throw new ValidationError('Agent Commons A2A card-candidate projection identity is invalid');
  }

  if (
    projection.agent_card !== null
    || projection.agent_card_servable !== false
    || projection.agent_card_conformant !== false
    || projection.interface_required_before_agent_card !== true
    || projection.supported_interfaces_advertised !== 0
    || projection.network_listener !== false
    || projection.task_operations !== false
    || projection.message_operations !== false
    || projection.public_state_only !== true
    || projection.private_grid_access !== false
    || projection.consequential_tools !== false
    || projection.machine_authority_mapping !== false
    || projection.authority_granted !== false
    || projection.compatibility_claimed !== false
    || projection.production_compatibility_claimed !== false
  ) {
    throw new ValidationError('Agent Commons A2A card-candidate projection boundary is invalid');
  }

  validateCardTemplate(projection.card_template);

  if (!Array.isArray(projection.public_state_projections) || projection.public_state_projections.length !== SKILL_DEFINITIONS.length) {
    throw new ValidationError('Agent Commons A2A public-state projection count is invalid');
  }
  for (let index = 0; index < projection.public_state_projections.length; index += 1) {
    const actual = projection.public_state_projections[index];
    const expected = SKILL_DEFINITIONS[index];
    exactKeys(actual, `Agent Commons A2A public-state projection ${index}`, ['skill_id', 'c0_method', 'response']);
    if (actual.skill_id !== expected.id || actual.c0_method !== A2A_SKILL_MAP[expected.id]) {
      throw new ValidationError('Agent Commons A2A public-state mapping drifted');
    }
    validateAgentCommonsReadonlyResponse(actual.response);
    if (actual.response.method !== actual.c0_method) {
      throw new ValidationError('Agent Commons A2A public-state response method drifted');
    }
  }

  const { digest, ...document } = projection;
  if (!/^[0-9a-f]{64}$/.test(digest ?? '') || digestObject(document) !== digest) {
    throw new ValidationError('Agent Commons A2A card-candidate digest is invalid');
  }
  if (Buffer.byteLength(canonicalJson(document), 'utf8') > LIMITS.max_projection_bytes) {
    throw new ValidationError('Agent Commons A2A card-candidate projection exceeds its bound');
  }
  return projection;
}

async function loadManifest() {
  const metadata = await lstat(MANIFEST_PATH);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MANIFEST_MAX_BYTES) {
    throw new ValidationError('Agent Commons A2A card-candidate manifest file is invalid');
  }
  const canonical = await realpath(MANIFEST_PATH);
  if (resolve(canonical) !== resolve(MANIFEST_PATH)) {
    throw new ValidationError('Agent Commons A2A card-candidate manifest cannot traverse links');
  }
  try {
    return JSON.parse(await readFile(canonical, 'utf8'));
  } catch {
    throw new ValidationError('Agent Commons A2A card-candidate manifest must contain valid JSON');
  }
}

function validateCardTemplate(template) {
  exactKeys(template, 'Agent Commons A2A card template', [
    'name',
    'description',
    'version',
    'capabilities',
    'securitySchemes',
    'securityRequirements',
    'defaultInputModes',
    'defaultOutputModes',
    'skills'
  ]);
  if (
    template.name !== 'AXIOM-MESH Agent Commons Read-Only Candidate'
    || template.version !== SUPPORTED_BUILD
    || typeof template.description !== 'string'
    || !template.description.includes('not a servable A2A Agent Card')
    || Object.hasOwn(template, 'supportedInterfaces')
    || Object.hasOwn(template, 'url')
  ) {
    throw new ValidationError('Agent Commons A2A card template identity/interface boundary is invalid');
  }

  exactKeys(template.capabilities, 'Agent Commons A2A card capabilities', [
    'streaming',
    'pushNotifications',
    'extendedAgentCard'
  ]);
  if (
    template.capabilities.streaming !== false
    || template.capabilities.pushNotifications !== false
    || template.capabilities.extendedAgentCard !== false
  ) {
    throw new ValidationError('Agent Commons A2A card capability boundary is invalid');
  }
  exactKeys(template.securitySchemes, 'Agent Commons A2A security schemes', []);
  if (!Array.isArray(template.securityRequirements) || template.securityRequirements.length !== 0) {
    throw new ValidationError('Agent Commons A2A security requirements must remain empty');
  }
  if (canonicalJson(template.defaultInputModes) !== canonicalJson(['application/json'])) {
    throw new ValidationError('Agent Commons A2A default input modes drifted');
  }
  if (canonicalJson(template.defaultOutputModes) !== canonicalJson(['application/json'])) {
    throw new ValidationError('Agent Commons A2A default output modes drifted');
  }
  if (!Array.isArray(template.skills) || template.skills.length !== SKILL_DEFINITIONS.length) {
    throw new ValidationError('Agent Commons A2A card skills are invalid');
  }
  for (let index = 0; index < template.skills.length; index += 1) {
    if (canonicalJson(template.skills[index]) !== canonicalJson(SKILL_DEFINITIONS[index])) {
      throw new ValidationError('Agent Commons A2A card skill metadata drifted');
    }
  }
}

function skillDefinition(id, name, description) {
  return Object.freeze({
    id,
    name,
    description,
    tags: Object.freeze(['axiom-mesh', 'read-only', 'public-state']),
    inputModes: Object.freeze(['application/json']),
    outputModes: Object.freeze(['application/json'])
  });
}

function exactKeys(value, label, expected) {
  if (!plainObject(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
