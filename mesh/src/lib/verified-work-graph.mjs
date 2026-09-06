import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  digestObject
} from './canonical.mjs';

export const VERIFIED_WORK_GRAPH_SCHEMA = 'axiom-verified-work-graph.v0';

const VERSION = '0.1.0';
const STATUS = 'inert-evidence';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const KINDS = new Set(['goal', 'task', 'artifact', 'verification']);
const STATES = new Set(['proposed', 'ready', 'accepted', 'rejected', 'blocked']);
const VERIFICATION_RESULTS = new Set(['pass', 'fail', 'indeterminate', 'not-applicable']);

const TOP_LEVEL_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'graph_id',
  'subject_ref',
  'nodes',
  'created_at',
  'contains_secret_material',
  'authority_effect',
  'network_effect',
  'execution_authority'
]);

const NODE_FIELDS = Object.freeze([
  'node_id',
  'kind',
  'label',
  'state',
  'dependencies',
  'artifact_digest',
  'verification_result',
  'verifier_ref',
  'verification_evidence_digest',
  'lineage_ref'
]);

function assertExactFields(value, fields, name) {
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} contains unknown field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${name}.${key} is required`);
  }
}

function identifier(value, name) {
  return assertString(value, name, { max: 160, pattern: IDENTIFIER });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function optionalIdentifier(value, name) {
  return value === null ? null : identifier(value, name);
}

function validateNode(input, index) {
  const name = `verified work graph.nodes[${index}]`;
  const value = assertPlainObject(input, name);
  assertExactFields(value, NODE_FIELDS, name);

  const kind = assertString(value.kind, `${name}.kind`, { max: 32 });
  if (!KINDS.has(kind)) throw new ValidationError(`${name}.kind is unsupported`);
  const state = assertString(value.state, `${name}.state`, { max: 32 });
  if (!STATES.has(state)) throw new ValidationError(`${name}.state is unsupported`);
  const verificationResult = assertString(value.verification_result, `${name}.verification_result`, { max: 32 });
  if (!VERIFICATION_RESULTS.has(verificationResult)) throw new ValidationError(`${name}.verification_result is unsupported`);

  const dependencies = assertStringArray(value.dependencies, `${name}.dependencies`, { maxItems: 256, itemMax: 160 });
  for (let dependencyIndex = 0; dependencyIndex < dependencies.length; dependencyIndex += 1) {
    identifier(dependencies[dependencyIndex], `${name}.dependencies[${dependencyIndex}]`);
  }

  const nodeId = identifier(value.node_id, `${name}.node_id`);
  if (dependencies.includes(nodeId)) throw new ValidationError(`${name} contains a self-dependency`);
  if (new Set(dependencies).size !== dependencies.length) throw new ValidationError(`${name} contains a duplicate dependency`);

  if (kind === 'goal' && dependencies.length !== 0) {
    throw new ValidationError(`${name} goal must not contain dependencies`);
  }

  let artifactDigest = null;
  if (kind === 'artifact') {
    if (value.artifact_digest === null) throw new ValidationError(`${name} artifact requires an artifact digest`);
    artifactDigest = digest(value.artifact_digest, `${name}.artifact_digest`);
  } else if (value.artifact_digest !== null) {
    throw new ValidationError(`${name} non-artifact node must not contain an artifact digest`);
  }

  let verifierRef = null;
  let verificationEvidenceDigest = null;
  if (kind === 'verification') {
    if (dependencies.length === 0) throw new ValidationError(`${name} verification requires at least one dependency`);
    if (verificationResult === 'not-applicable') throw new ValidationError(`${name} verification requires a verification result`);
    if (value.verifier_ref === null) throw new ValidationError(`${name} verification requires a verifier`);
    if (value.verification_evidence_digest === null) throw new ValidationError(`${name} verification requires evidence`);
    verifierRef = identifier(value.verifier_ref, `${name}.verifier_ref`);
    verificationEvidenceDigest = digest(value.verification_evidence_digest, `${name}.verification_evidence_digest`);
  } else {
    if (verificationResult !== 'not-applicable') throw new ValidationError(`${name} non-verification node must use not-applicable`);
    if (value.verifier_ref !== null || value.verification_evidence_digest !== null) {
      throw new ValidationError(`${name} non-verification node cannot contain verifier evidence`);
    }
  }

  return Object.freeze({
    node_id: nodeId,
    kind,
    label: assertString(value.label, `${name}.label`, { max: 512 }),
    state,
    dependencies: Object.freeze([...dependencies]),
    artifact_digest: artifactDigest,
    verification_result: verificationResult,
    verifier_ref: verifierRef,
    verification_evidence_digest: verificationEvidenceDigest,
    lineage_ref: optionalIdentifier(value.lineage_ref, `${name}.lineage_ref`)
  });
}

function topologicalOrderFromNodes(nodes) {
  const byId = new Map(nodes.map(node => [node.node_id, node]));
  const inDegree = new Map(nodes.map(node => [node.node_id, node.dependencies.length]));
  const outgoing = new Map(nodes.map(node => [node.node_id, []]));

  for (const node of nodes) {
    for (const dependency of node.dependencies) {
      if (!byId.has(dependency)) throw new ValidationError(`verified work graph node ${node.node_id} references missing dependency ${dependency}`);
      outgoing.get(dependency).push(node.node_id);
    }
  }

  for (const dependents of outgoing.values()) dependents.sort();
  const ready = [...nodes.filter(node => inDegree.get(node.node_id) === 0).map(node => node.node_id)].sort();
  const order = [];

  while (ready.length > 0) {
    const nodeId = ready.shift();
    order.push(nodeId);
    for (const dependent of outgoing.get(nodeId)) {
      const remaining = inDegree.get(dependent) - 1;
      inDegree.set(dependent, remaining);
      if (remaining === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }

  if (order.length !== nodes.length) throw new ValidationError('verified work graph contains a dependency cycle');
  return Object.freeze(order);
}

export function validateVerifiedWorkGraph(input) {
  const value = assertPlainObject(input, 'verified work graph');
  assertExactFields(value, TOP_LEVEL_FIELDS, 'verified work graph');

  if (value.schema !== VERIFIED_WORK_GRAPH_SCHEMA) throw new ValidationError('verified work graph.schema is unsupported');
  if (value.version !== VERSION) throw new ValidationError(`verified work graph.version must be ${VERSION}`);
  if (value.status !== STATUS) throw new ValidationError(`verified work graph.status must be ${STATUS}`);
  if (value.contains_secret_material !== false) throw new ValidationError('verified work graph.contains_secret_material must be false');
  if (value.authority_effect !== 'none') throw new ValidationError('verified work graph.authority_effect must be none');
  if (value.network_effect !== 'none') throw new ValidationError('verified work graph.network_effect must be none');
  if (value.execution_authority !== false) throw new ValidationError('verified work graph.execution_authority must be false');
  if (!Array.isArray(value.nodes) || value.nodes.length === 0 || value.nodes.length > 4096) {
    throw new ValidationError('verified work graph.nodes must contain 1-4096 nodes');
  }

  const nodes = value.nodes.map(validateNode);
  const ids = new Set();
  for (const node of nodes) {
    if (ids.has(node.node_id)) throw new ValidationError(`verified work graph contains duplicate node ${node.node_id}`);
    ids.add(node.node_id);
  }

  const goals = nodes.filter(node => node.kind === 'goal');
  if (goals.length !== 1) throw new ValidationError('verified work graph requires exactly one goal');

  topologicalOrderFromNodes(nodes);

  const createdAt = assertString(value.created_at, 'verified work graph.created_at', { max: 32, pattern: ISO_TIMESTAMP });
  if (!Number.isFinite(Date.parse(createdAt))) throw new ValidationError('verified work graph.created_at is not a valid timestamp');

  return Object.freeze({
    schema: VERIFIED_WORK_GRAPH_SCHEMA,
    version: VERSION,
    status: STATUS,
    graph_id: identifier(value.graph_id, 'verified work graph.graph_id'),
    subject_ref: assertString(value.subject_ref, 'verified work graph.subject_ref', { max: 512 }),
    nodes: Object.freeze(nodes),
    created_at: createdAt,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    execution_authority: false
  });
}

export function verifiedWorkGraphTopologicalOrder(input) {
  const normalized = validateVerifiedWorkGraph(input);
  return topologicalOrderFromNodes(normalized.nodes);
}

export function verifiedWorkGraphDigest(input) {
  return digestObject(validateVerifiedWorkGraph(input));
}
