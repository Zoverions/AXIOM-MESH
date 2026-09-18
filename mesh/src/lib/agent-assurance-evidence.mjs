import { canonicalJson, digestObject, ValidationError } from './canonical.mjs';

export const AGENT_ASSURANCE_EVIDENCE_SCHEMA = 'axiom-agent-assurance-evidence.v0';
export const AGENT_ASSURANCE_ASSESSMENT_SCHEMA = 'axiom-agent-assurance-assessment.v0';
export const AGENT_ASSURANCE_ATTESTATION_SCHEMA = 'axiom-agent-assurance-attestation.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:/@+-]{0,255}$/;
const HEX_DIGEST = /^[a-f0-9]{64}$/;
const EGRESS_LEVEL = new Map([['none', 0], ['loopback', 1], ['allowlist', 2]]);
const PROVENANCE_KINDS = new Set(['source', 'tool', 'artifact', 'decision']);
const TASK_STATUSES = new Set(['planned', 'running', 'blocked', 'completed', 'cancelled']);

export function normalizeAgentAssuranceEvidence(value) {
  const input = record(value, 'agent assurance evidence');
  exactKeys(input, [
    'schema', 'agent', 'provenance', 'environment', 'oversight', 'evaluator_bundle', 'mission_graph'
  ], 'agent assurance evidence');
  if (input.schema !== undefined && input.schema !== AGENT_ASSURANCE_EVIDENCE_SCHEMA) {
    throw new ValidationError('Agent assurance evidence schema is unsupported');
  }

  return {
    schema: AGENT_ASSURANCE_EVIDENCE_SCHEMA,
    agent: normalizeAgentBinding(input.agent),
    provenance: normalizeProvenance(input.provenance),
    environment: normalizeEnvironmentEvidence(input.environment),
    oversight: normalizeOversight(input.oversight),
    evaluator_bundle: normalizeEvaluatorBundle(input.evaluator_bundle),
    mission_graph: normalizeMissionGraph(input.mission_graph)
  };
}

export function assessAgentAssuranceEvidence(value) {
  const evidence = normalizeAgentAssuranceEvidence(value);
  const findings = [];
  findings.push(...environmentFindings(evidence.environment));

  if (
    evidence.oversight.total_actions > 0
    && evidence.oversight.monitored_actions < evidence.oversight.total_actions
  ) {
    findings.push({
      code: 'monitor_coverage_incomplete',
      severity: 'incomplete',
      detail: 'Not every recorded action was observed by the declared monitor.'
    });
  }

  const total = evidence.oversight.total_actions;
  const coverage = total === 0
    ? null
    : Math.floor((evidence.oversight.monitored_actions * 10_000) / total);

  return {
    schema: AGENT_ASSURANCE_ASSESSMENT_SCHEMA,
    evidence_digest: digestObject(evidence),
    conformant: findings.length === 0,
    findings,
    metrics: {
      monitor_coverage_basis_points: coverage,
      total_actions: total,
      monitored_actions: evidence.oversight.monitored_actions,
      blocked_actions: evidence.oversight.blocked_actions,
      escalated_actions: evidence.oversight.escalated_actions,
      review_latency_ms_p50: evidence.oversight.review_latency_ms_p50,
      review_latency_ms_p95: evidence.oversight.review_latency_ms_p95
    },
    authority_effect: 'none',
    authorizes_execution: false
  };
}

export function sealAgentAssuranceEvidence(value, identity) {
  if (!identity || typeof identity.service !== 'string' || typeof identity.signObject !== 'function') {
    throw new ValidationError('Agent assurance signer must expose service and signObject');
  }
  const evidence = normalizeAgentAssuranceEvidence(value);
  const statement = {
    schema: AGENT_ASSURANCE_ATTESTATION_SCHEMA,
    signer: identifier(identity.service, 'agent assurance signer'),
    evidence_digest: digestObject(evidence),
    evidence,
    authority_effect: 'none'
  };
  const attestation = identity.signObject(statement);
  validateAttestationShape(attestation);
  return { statement, attestation };
}

export function verifySealedAgentAssuranceEvidence(recordValue, { verifySignature } = {}) {
  const envelope = record(recordValue, 'sealed agent assurance evidence');
  exactKeys(envelope, ['statement', 'attestation'], 'sealed agent assurance evidence');
  const statement = record(envelope.statement, 'agent assurance statement');
  exactKeys(statement, [
    'schema', 'signer', 'evidence_digest', 'evidence', 'authority_effect'
  ], 'agent assurance statement');
  if (statement.schema !== AGENT_ASSURANCE_ATTESTATION_SCHEMA) {
    throw new ValidationError('Agent assurance attestation schema is unsupported');
  }
  if (statement.authority_effect !== 'none') {
    throw new ValidationError('Agent assurance attestation cannot carry authority');
  }
  identifier(statement.signer, 'agent assurance signer');
  digest(statement.evidence_digest, 'agent assurance evidence_digest');
  const evidence = normalizeAgentAssuranceEvidence(statement.evidence);
  if (digestObject(evidence) !== statement.evidence_digest) {
    throw new ValidationError('Agent assurance evidence digest does not match normalized evidence');
  }
  validateAttestationShape(envelope.attestation);
  if (typeof verifySignature !== 'function') {
    throw new ValidationError('Agent assurance verification requires verifySignature');
  }
  if (verifySignature(statement, envelope.attestation) !== true) {
    throw new ValidationError('Agent assurance signature is invalid');
  }
  return {
    verified: true,
    signer: statement.signer,
    evidence,
    assessment: assessAgentAssuranceEvidence(evidence),
    authority_effect: 'none',
    authorizes_execution: false
  };
}

function normalizeAgentBinding(value) {
  const input = record(value, 'agent binding');
  exactKeys(input, [
    'agent_id', 'principal_id', 'authority_digest', 'model_id', 'run_id'
  ], 'agent binding');
  const agentId = identifier(input.agent_id, 'agent_id');
  const principalId = identifier(input.principal_id, 'principal_id');
  const modelId = identifier(input.model_id, 'model_id');
  const runId = identifier(input.run_id, 'run_id');
  if (agentId === modelId || agentId === runId || modelId === runId) {
    throw new ValidationError('agent_id, model_id, and run_id must remain distinct identities');
  }
  return {
    agent_id: agentId,
    principal_id: principalId,
    authority_digest: digest(input.authority_digest, 'authority_digest'),
    model_id: modelId,
    run_id: runId
  };
}

function normalizeProvenance(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) {
    throw new ValidationError('Agent assurance provenance must contain 1-128 entries');
  }
  const seen = new Set();
  return value.map((item, index) => {
    const input = record(item, `provenance[${index}]`);
    exactKeys(input, ['kind', 'ref', 'digest'], `provenance[${index}]`);
    if (!PROVENANCE_KINDS.has(input.kind)) {
      throw new ValidationError(`provenance[${index}].kind is invalid`);
    }
    const ref = identifier(input.ref, `provenance[${index}].ref`);
    const itemDigest = digest(input.digest, `provenance[${index}].digest`);
    const key = `${input.kind}\0${ref}\0${itemDigest}`;
    if (seen.has(key)) throw new ValidationError('Agent assurance provenance contains a duplicate entry');
    seen.add(key);
    return { kind: input.kind, ref, digest: itemDigest };
  }).sort((a, b) => compareText(canonicalJson(a), canonicalJson(b)));
}

function normalizeEnvironmentEvidence(value) {
  const input = record(value, 'environment evidence');
  exactKeys(input, ['declared', 'observed'], 'environment evidence');
  return {
    declared: normalizeEnvironmentProfile(input.declared, 'declared environment'),
    observed: normalizeEnvironmentProfile(input.observed, 'observed environment')
  };
}

function normalizeEnvironmentProfile(value, name) {
  const input = record(value, name);
  exactKeys(input, [
    'egress', 'network_destinations', 'writable_paths', 'secret_refs', 'tools'
  ], name);
  if (!EGRESS_LEVEL.has(input.egress)) throw new ValidationError(`${name}.egress is invalid`);
  const profile = {
    egress: input.egress,
    network_destinations: stringSet(input.network_destinations, `${name}.network_destinations`, 128),
    writable_paths: stringSet(input.writable_paths, `${name}.writable_paths`, 128),
    secret_refs: stringSet(input.secret_refs, `${name}.secret_refs`, 128),
    tools: stringSet(input.tools, `${name}.tools`, 128)
  };
  if (profile.egress === 'none' && profile.network_destinations.length > 0) {
    throw new ValidationError(`${name} with egress none cannot declare network destinations`);
  }
  return profile;
}

function normalizeOversight(value) {
  const input = record(value, 'oversight evidence');
  exactKeys(input, [
    'monitor_ref', 'total_actions', 'monitored_actions', 'blocked_actions',
    'escalated_actions', 'review_latency_ms_p50', 'review_latency_ms_p95'
  ], 'oversight evidence');
  const normalized = {
    monitor_ref: identifier(input.monitor_ref, 'oversight monitor_ref'),
    total_actions: integer(input.total_actions, 'oversight total_actions', 0, 1_000_000_000),
    monitored_actions: integer(input.monitored_actions, 'oversight monitored_actions', 0, 1_000_000_000),
    blocked_actions: integer(input.blocked_actions, 'oversight blocked_actions', 0, 1_000_000_000),
    escalated_actions: integer(input.escalated_actions, 'oversight escalated_actions', 0, 1_000_000_000),
    review_latency_ms_p50: integer(input.review_latency_ms_p50, 'oversight review_latency_ms_p50', 0, 86_400_000),
    review_latency_ms_p95: integer(input.review_latency_ms_p95, 'oversight review_latency_ms_p95', 0, 86_400_000)
  };
  if (normalized.monitored_actions > normalized.total_actions) {
    throw new ValidationError('oversight monitored_actions cannot exceed total_actions');
  }
  if (normalized.blocked_actions > normalized.monitored_actions) {
    throw new ValidationError('oversight blocked_actions cannot exceed monitored_actions');
  }
  if (normalized.escalated_actions > normalized.monitored_actions) {
    throw new ValidationError('oversight escalated_actions cannot exceed monitored_actions');
  }
  if (normalized.review_latency_ms_p50 > normalized.review_latency_ms_p95) {
    throw new ValidationError('oversight p50 review latency cannot exceed p95');
  }
  return normalized;
}

function normalizeEvaluatorBundle(value) {
  const input = record(value, 'evaluator bundle');
  exactKeys(input, ['bundle_id', 'bundle_digest', 'evaluators'], 'evaluator bundle');
  if (!Array.isArray(input.evaluators) || input.evaluators.length < 1 || input.evaluators.length > 16) {
    throw new ValidationError('Evaluator bundle must contain 1-16 evaluators');
  }
  const seen = new Set();
  const evaluators = input.evaluators.map((item, index) => {
    const entry = record(item, `evaluator[${index}]`);
    exactKeys(entry, [
      'evaluator_id', 'artifact_digest', 'execution_mode', 'network', 'authority'
    ], `evaluator[${index}]`);
    const evaluatorId = identifier(entry.evaluator_id, `evaluator[${index}].evaluator_id`);
    if (seen.has(evaluatorId)) throw new ValidationError('Evaluator bundle contains duplicate evaluator ids');
    seen.add(evaluatorId);
    if (entry.execution_mode !== 'isolated-readonly') {
      throw new ValidationError('Evaluator execution_mode must be isolated-readonly in v0');
    }
    if (entry.network !== 'none') {
      throw new ValidationError('Evaluator network must be none in v0');
    }
    if (entry.authority !== 'none') {
      throw new ValidationError('Evaluator bundle cannot grant authority');
    }
    return {
      evaluator_id: evaluatorId,
      artifact_digest: digest(entry.artifact_digest, `evaluator[${index}].artifact_digest`),
      execution_mode: 'isolated-readonly',
      network: 'none',
      authority: 'none'
    };
  }).sort((a, b) => compareText(a.evaluator_id, b.evaluator_id));
  return {
    bundle_id: identifier(input.bundle_id, 'evaluator bundle_id'),
    bundle_digest: digest(input.bundle_digest, 'evaluator bundle_digest'),
    evaluators
  };
}

function normalizeMissionGraph(value) {
  const input = record(value, 'mission graph');
  exactKeys(input, ['graph_id', 'delegation_mode', 'authority_effect', 'nodes'], 'mission graph');
  if (input.delegation_mode !== 'observational-only') {
    throw new ValidationError('Mission graph v0 delegation_mode must be observational-only');
  }
  if (input.authority_effect !== 'none') {
    throw new ValidationError('Mission graph v0 cannot grant authority');
  }
  if (!Array.isArray(input.nodes) || input.nodes.length < 1 || input.nodes.length > 256) {
    throw new ValidationError('Mission graph must contain 1-256 nodes');
  }
  const nodes = input.nodes.map((item, index) => {
    const node = record(item, `mission_graph.nodes[${index}]`);
    exactKeys(node, [
      'task_id', 'parent_task_id', 'actor_ref', 'objective_digest', 'status'
    ], `mission_graph.nodes[${index}]`);
    if (!TASK_STATUSES.has(node.status)) {
      throw new ValidationError(`mission_graph.nodes[${index}].status is invalid`);
    }
    return {
      task_id: identifier(node.task_id, `mission_graph.nodes[${index}].task_id`),
      parent_task_id: node.parent_task_id === null
        ? null
        : identifier(node.parent_task_id, `mission_graph.nodes[${index}].parent_task_id`),
      actor_ref: identifier(node.actor_ref, `mission_graph.nodes[${index}].actor_ref`),
      objective_digest: digest(node.objective_digest, `mission_graph.nodes[${index}].objective_digest`),
      status: node.status
    };
  });
  validateGraph(nodes);
  return {
    graph_id: identifier(input.graph_id, 'mission graph_id'),
    delegation_mode: 'observational-only',
    authority_effect: 'none',
    nodes: [...nodes].sort((a, b) => compareText(a.task_id, b.task_id))
  };
}

function validateGraph(nodes) {
  const byId = new Map();
  for (const node of nodes) {
    if (byId.has(node.task_id)) throw new ValidationError('Mission graph task ids must be unique');
    byId.set(node.task_id, node);
  }
  const roots = nodes.filter(node => node.parent_task_id === null);
  if (roots.length !== 1) throw new ValidationError('Mission graph must contain exactly one root task');
  for (const node of nodes) {
    if (node.parent_task_id !== null && !byId.has(node.parent_task_id)) {
      throw new ValidationError('Mission graph parent task must exist');
    }
    if (node.parent_task_id === node.task_id) {
      throw new ValidationError('Mission graph task cannot parent itself');
    }
  }
  for (const node of nodes) {
    const seen = new Set();
    let current = node;
    while (current.parent_task_id !== null) {
      if (seen.has(current.task_id)) throw new ValidationError('Mission graph cannot contain cycles');
      seen.add(current.task_id);
      current = byId.get(current.parent_task_id);
    }
  }
}

function environmentFindings({ declared, observed }) {
  const findings = [];
  if (EGRESS_LEVEL.get(observed.egress) > EGRESS_LEVEL.get(declared.egress)) {
    findings.push({
      code: 'environment_egress_exceeds_declaration',
      severity: 'hard',
      detail: `Observed egress ${observed.egress} exceeds declared ${declared.egress}.`
    });
  }
  for (const field of ['network_destinations', 'writable_paths', 'secret_refs', 'tools']) {
    const declaredSet = new Set(declared[field]);
    const unexpected = observed[field].filter(item => !declaredSet.has(item));
    if (unexpected.length) {
      findings.push({
        code: `environment_${field}_exceeds_declaration`,
        severity: 'hard',
        detail: `Observed ${field} contains undeclared entries.`,
        refs: unexpected
      });
    }
  }
  return findings;
}

function validateAttestationShape(value) {
  const input = record(value, 'agent assurance attestation');
  exactKeys(input, ['algorithm', 'key_id', 'digest', 'signature'], 'agent assurance attestation');
  if (input.algorithm !== 'Ed25519') throw new ValidationError('Agent assurance attestation must use Ed25519');
  identifier(input.key_id, 'agent assurance attestation key_id');
  digest(input.digest, 'agent assurance attestation digest');
  if (typeof input.signature !== 'string' || input.signature.length < 16 || input.signature.length > 1024) {
    throw new ValidationError('Agent assurance attestation signature is invalid');
  }
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function record(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  return value;
}

function exactKeys(value, allowedKeys, name) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} contains unsupported field: ${key}`);
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(value, key) && key !== 'schema') {
      throw new ValidationError(`${name} is missing required field: ${key}`);
    }
  }
}

function identifier(value, name) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new ValidationError(`${name} is invalid`);
  }
  return value;
}

function digest(value, name) {
  if (typeof value !== 'string' || !HEX_DIGEST.test(value)) {
    throw new ValidationError(`${name} must be a lowercase sha256 digest`);
  }
  return value;
}

function integer(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function stringSet(value, name, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(`${name} must be an array with at most ${maxItems} items`);
  }
  const items = value.map((item, index) => identifier(item, `${name}[${index}]`));
  return [...new Set(items)].sort();
}
