import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  FLOW_PLAN_SCHEMA,
  FLOW_PROPOSAL_SCHEMA,
  compileFlowProposal,
  computeFlowPlanDigest,
  computeFlowProposalDigest,
  validateFlowPlan,
  validateFlowProposal
} from '../src/lib/flow-compiler.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);

function proposal(overrides = {}) {
  const base = {
    schema: FLOW_PROPOSAL_SCHEMA,
    version: 0,
    status: 'inert-flow-proposal',
    flow_id: 'flow.daily.research.v1',
    task_digest: A,
    purpose_digest: B,
    completion: {
      required_step_ids: ['publish'],
      on_blocked: 'stop',
      on_authority_missing: 'stop',
      on_budget_exhausted: 'stop',
      on_uncertain_effect: 'stop-and-escalate'
    },
    budget: {
      max_steps: 8,
      max_network_steps: 3,
      max_mutation_steps: 2,
      max_total_attempts: 8
    },
    steps: [
      {
        step_id: 'collect',
        operation_id: 'research.search',
        operation_manifest_digest: C,
        depends_on: [],
        required_capability_ids: ['research.read'],
        input_schema_digest: D,
        output_schema_digest: E,
        semantic_evidence_digests: [],
        effect_class: 'read',
        effect_scope: 'external',
        network: 'required',
        persistence: 'none',
        retry: {
          max_attempts: 2,
          backoff_ms: 100,
          idempotency_mode: 'intrinsic',
          idempotency_scope: 'step'
        },
        failure: {
          on_failure: 'stop',
          on_uncertain_completion: 'not-applicable'
        }
      },
      {
        step_id: 'analyze',
        operation_id: 'research.compare',
        operation_manifest_digest: D,
        depends_on: ['collect'],
        required_capability_ids: [],
        input_schema_digest: E,
        output_schema_digest: F,
        semantic_evidence_digests: [B, A],
        effect_class: 'pure',
        effect_scope: 'local',
        network: 'none',
        persistence: 'none',
        retry: {
          max_attempts: 1,
          backoff_ms: 0,
          idempotency_mode: 'none',
          idempotency_scope: null
        },
        failure: {
          on_failure: 'stop',
          on_uncertain_completion: 'not-applicable'
        }
      },
      {
        step_id: 'publish',
        operation_id: 'social.publication.create',
        operation_manifest_digest: E,
        depends_on: ['analyze'],
        required_capability_ids: ['social.publish', 'research.read'],
        input_schema_digest: F,
        output_schema_digest: C,
        semantic_evidence_digests: [],
        effect_class: 'mutation',
        effect_scope: 'external',
        network: 'required',
        persistence: 'none',
        retry: {
          max_attempts: 1,
          backoff_ms: 0,
          idempotency_mode: 'none',
          idempotency_scope: null
        },
        failure: {
          on_failure: 'escalate',
          on_uncertain_completion: 'stop-and-escalate'
        }
      }
    ],
    authority_effect: 'none',
    execution_effect: 'none',
    network_effect: 'none',
    persistence_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false
  };
  return {
    ...base,
    ...overrides
  };
}

function clone(value) {
  return structuredClone(value);
}

test('compiles a deterministic inert workflow plan with explicit effect summary', () => {
  const input = proposal();
  const plan = compileFlowProposal(input);

  assert.equal(plan.schema, FLOW_PLAN_SCHEMA);
  assert.deepEqual(plan.steps.map(step => step.step_id), ['collect', 'analyze', 'publish']);
  assert.deepEqual(plan.required_capability_ids, ['research.read', 'social.publish']);
  assert.deepEqual(plan.steps[1].semantic_evidence_digests, [A, B]);
  assert.deepEqual(plan.effect_summary, {
    step_count: 3,
    pure_steps: 1,
    read_steps: 1,
    mutation_steps: 1,
    local_steps: 1,
    external_steps: 2,
    network_steps: 2,
    persistence_read_steps: 0,
    persistence_write_steps: 0,
    total_attempt_ceiling: 4
  });
  assert.equal(plan.authority_effect, 'none');
  assert.equal(plan.execution_effect, 'none');
  assert.equal(plan.network_effect, 'none');
  assert.equal(plan.persistence_effect, 'none');
  assert.equal(plan.credential_visibility, 'none');
  assert.equal(plan.runtime_activation, false);
  assert.equal(validateFlowProposal(input).valid, true);
  assert.equal(validateFlowPlan(plan).valid, true);
  assert.equal(computeFlowPlanDigest(plan), plan.plan_digest);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.steps[0]), true);
});

test('proposal order and set-like array ordering do not change proposal or plan digest', () => {
  const first = proposal();
  const second = proposal();
  second.steps.reverse();
  second.steps.find(step => step.step_id === 'publish').required_capability_ids.reverse();
  second.steps.find(step => step.step_id === 'analyze').semantic_evidence_digests.reverse();

  const firstPlan = compileFlowProposal(first);
  const secondPlan = compileFlowProposal(second);

  assert.equal(computeFlowProposalDigest(first), computeFlowProposalDigest(second));
  assert.equal(firstPlan.source_proposal_digest, secondPlan.source_proposal_digest);
  assert.equal(firstPlan.plan_digest, secondPlan.plan_digest);
  assert.deepEqual(firstPlan, secondPlan);
});

test('duplicate missing self and cyclic dependencies fail closed', () => {
  const duplicate = proposal();
  duplicate.steps[1].step_id = 'collect';
  assert.throws(() => compileFlowProposal(duplicate), /duplicate step_id/i);

  const missing = proposal();
  missing.steps[1].depends_on = ['missing'];
  assert.throws(() => compileFlowProposal(missing), /missing step/i);

  const self = proposal();
  self.steps[0].depends_on = ['collect'];
  assert.throws(() => compileFlowProposal(self), /depend on itself/i);

  const cycle = proposal();
  cycle.steps[0].depends_on = ['publish'];
  assert.throws(() => compileFlowProposal(cycle), /cycle/i);
});

test('mutation retries require explicit idempotency semantics', () => {
  const input = proposal();
  const publish = input.steps.find(step => step.step_id === 'publish');
  publish.retry.max_attempts = 2;
  input.budget.max_total_attempts = 9;

  assert.throws(
    () => compileFlowProposal(input),
    /mutation retries require explicit idempotency/i
  );

  publish.retry.idempotency_mode = 'keyed';
  publish.retry.idempotency_scope = 'effect';
  const plan = compileFlowProposal(input);
  assert.equal(plan.effect_summary.total_attempt_ceiling, 5);
});

test('external mutation uncertainty must stop and escalate', () => {
  const input = proposal();
  input.steps.find(step => step.step_id === 'publish').failure.on_uncertain_completion =
    'not-applicable';

  assert.throws(
    () => compileFlowProposal(input),
    /uncertainty must stop and escalate/i
  );
});

test('hard workflow budgets reject excess network mutation and attempt counts', () => {
  const network = proposal();
  network.budget.max_network_steps = 1;
  assert.throws(() => compileFlowProposal(network), /max_network_steps/i);

  const mutation = proposal();
  mutation.budget.max_mutation_steps = 0;
  assert.throws(() => compileFlowProposal(mutation), /max_mutation_steps/i);

  const attempts = proposal();
  attempts.budget.max_total_attempts = 3;
  assert.throws(() => compileFlowProposal(attempts), /max_total_attempts/i);
});

test('required capability ids remain requests and never become grants', () => {
  const plan = compileFlowProposal(proposal());
  assert.deepEqual(plan.required_capability_ids, ['research.read', 'social.publish']);
  assert.equal(Object.hasOwn(plan, 'grants'), false);
  assert.equal(Object.hasOwn(plan, 'authorized'), false);
  assert.equal(Object.hasOwn(plan, 'capabilities'), false);

  const widened = proposal({ authority_effect: 'grant' });
  assert.throws(() => compileFlowProposal(widened), /boundary effect/i);

  const injected = proposal();
  injected.steps[0].authorized = true;
  assert.throws(() => compileFlowProposal(injected), /unknown field authorized/i);
});

test('semantic evidence is provenance only and cannot change boundary fields', () => {
  const input = proposal();
  input.steps[1].semantic_evidence_digests = [F, E, D];
  const plan = compileFlowProposal(input);

  assert.deepEqual(plan.steps[1].semantic_evidence_digests, [D, E, F]);
  assert.equal(plan.authority_effect, 'none');
  assert.equal(plan.execution_effect, 'none');
  assert.equal(plan.runtime_activation, false);
});

test('raw credential-shaped fields are outside the closed contract', () => {
  const topLevel = proposal();
  topLevel.api_key = 'secret';
  assert.throws(() => compileFlowProposal(topLevel), /unknown field api_key/i);

  const step = proposal();
  step.steps[0].credential = 'secret';
  assert.throws(() => compileFlowProposal(step), /unknown field credential/i);
});

test('compiled plan tampering is detected by semantic checks or self digest', () => {
  const plan = compileFlowProposal(proposal());

  const reordered = clone(plan);
  reordered.steps.reverse();
  assert.throws(() => validateFlowPlan(reordered), /deterministic compiled form/i);

  const tampered = clone(plan);
  tampered.effect_summary.network_steps = 0;
  assert.throws(() => validateFlowPlan(tampered), /effect_summary/i);

  const digestDrift = clone(plan);
  digestDrift.task_digest = F;
  assert.throws(() => validateFlowPlan(digestDrift), /digest mismatch/i);
});

test('completion contract cannot omit required fail-closed stopping semantics', () => {
  const input = proposal();
  input.completion.on_authority_missing = 'continue';

  assert.throws(
    () => compileFlowProposal(input),
    /fail-closed v0 stopping semantics/i
  );
});

test('flow compiler production module imports only canonical helpers and exposes no live I/O path', async () => {
  const source = await readFile(
    new URL('../src/lib/flow-compiler.mjs', import.meta.url),
    'utf8'
  );
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['./canonical.mjs']);
  assert.equal(/\bfetch\s*\(/.test(source), false);
  assert.equal(/\bprocess\./.test(source), false);
  assert.equal(/node:(?:fs|http|https|net|tls|child_process)/.test(source), false);
});

test('machine-readable flow schemas bind to the semantic validator and exact contract ids', async () => {
  const proposalSchema = JSON.parse(await readFile(
    new URL('../config/axiom-flow-proposal-v0.schema.json', import.meta.url),
    'utf8'
  ));
  const planSchema = JSON.parse(await readFile(
    new URL('../config/axiom-flow-plan-v0.schema.json', import.meta.url),
    'utf8'
  ));

  assert.equal(proposalSchema.properties.schema.const, FLOW_PROPOSAL_SCHEMA);
  assert.equal(planSchema.properties.schema.const, FLOW_PLAN_SCHEMA);
  assert.equal(
    proposalSchema['x-axiom-semantic-validator'],
    'mesh/src/lib/flow-compiler.mjs'
  );
  assert.equal(
    planSchema['x-axiom-semantic-validator'],
    'mesh/src/lib/flow-compiler.mjs'
  );
});
