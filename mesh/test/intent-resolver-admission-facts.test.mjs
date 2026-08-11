import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson, digestObject } from '../src/lib/canonical.mjs';
import {
  normalizeIntentExecutorRegistry
} from '../src/lib/intent-execution-eligibility.mjs';
import {
  REPOSITORY_DOCS_EFFECT_POLICY,
  REPOSITORY_DOCS_EFFECT_POLICY_DIGEST
} from '../src/lib/repository-docs-effect.mjs';
import { repositoryDocsEffectDestination } from '../src/lib/repository-docs-destination.mjs';
import { REPOSITORY_DOCS_INPUT_RESOLVER_ID } from '../src/lib/intent-executor-input-resolution.mjs';
import {
  classifyExecutorMappingInputMode,
  deriveRepositoryDocsResolverAdmissionFacts,
  normalizeRepositoryDocsResolverDeclaration
} from '../src/lib/intent-resolver-admission-facts.mjs';

const productionPolicy = JSON.parse(
  await readFile(new URL('../config/policy.json', import.meta.url), 'utf8')
);
const productionCapabilities = JSON.parse(
  await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8')
);
const productionRegistry = JSON.parse(
  await readFile(new URL('../config/intent-remediation-executors.json', import.meta.url), 'utf8')
);

function resolver(overrides = {}) {
  return {
    id: REPOSITORY_DOCS_INPUT_RESOLVER_ID,
    repository: REPOSITORY_DOCS_EFFECT_POLICY.repository,
    base_branch: REPOSITORY_DOCS_EFFECT_POLICY.base_branch,
    path_policy_digest: REPOSITORY_DOCS_EFFECT_POLICY_DIGEST,
    max_plan_lifetime_ms: 5 * 60 * 1000,
    ...overrides
  };
}

function resolverMapping(overrides = {}) {
  return {
    semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
    target_action: REPOSITORY_DOCS_EFFECT_POLICY.target_action,
    capability_id: REPOSITORY_DOCS_EFFECT_POLICY.capability_id,
    tool: REPOSITORY_DOCS_EFFECT_POLICY.tool,
    fixed_input: null,
    constraints: { input_resolver: resolver() },
    ...overrides
  };
}

function fixedMapping(overrides = {}) {
  return {
    semantic_action: 'repo.tests.add',
    target_action: 'system.echo',
    capability_id: 'core.intent-loop',
    tool: 'builtin.echo',
    fixed_input: { value: 'unchanged fixed-input mapping' },
    constraints: { conformance_only: true },
    ...overrides
  };
}

function policy() {
  const value = structuredClone(productionPolicy);
  value.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action] = {
    decision: 'allow',
    risk: 'high',
    required_scopes: ['repository:docs:write'],
    required_confirmations: 1,
    required_confirmation_values: ['confirm:repository.docs.pull-request.create'],
    requires_independent_approval: true,
    tool: REPOSITORY_DOCS_EFFECT_POLICY.tool,
    constraints: {
      repository: REPOSITORY_DOCS_EFFECT_POLICY.repository,
      docs_only: true
    },
    timeout_ms: 15_000
  };
  return value;
}

function capabilities() {
  const value = structuredClone(productionCapabilities);
  const existing = value.capabilities.find(
    item => item.id === REPOSITORY_DOCS_EFFECT_POLICY.capability_id
  );
  if (existing) existing.status = 'implemented';
  else value.capabilities.push({
    id: REPOSITORY_DOCS_EFFECT_POLICY.capability_id,
    family: 'repository',
    status: 'implemented',
    summary: 'Test-only repository-docs admission surface.'
  });
  return value;
}

test('fixed-input mapping normalization and digest remain unchanged', () => {
  const raw = fixedMapping();
  const existing = normalizeIntentExecutorRegistry({
    schema: 'axiom-intent-remediation-executor-registry.v1',
    kernel_version: '0.12.0-dev.3',
    mappings: [raw]
  }).mappings[0];
  const classified = classifyExecutorMappingInputMode(raw, '0.12.0-dev.3');

  assert.equal(classified.mode, 'fixed_input');
  assert.equal(classified.resolver, null);
  assert.equal(classified.resolver_digest, null);
  assert.deepEqual(classified.mapping, existing);
  assert.equal(classified.mapping.mapping_digest, digestObject({
    semantic_action: raw.semantic_action,
    target_action: raw.target_action,
    capability_id: raw.capability_id,
    tool: raw.tool,
    fixed_input: raw.fixed_input,
    constraints: raw.constraints
  }));
});

test('mapping input mode is exact one-of fixed_input or input_resolver', () => {
  assert.throws(
    () => classifyExecutorMappingInputMode(resolverMapping({
      fixed_input: { value: 'ambiguous' }
    }), '0.12.0-dev.3'),
    /both fixed_input and input_resolver/
  );
  assert.throws(
    () => classifyExecutorMappingInputMode(resolverMapping({ constraints: {} }), '0.12.0-dev.3'),
    /requires input_resolver/
  );
  assert.throws(
    () => classifyExecutorMappingInputMode(resolverMapping({
      constraints: {
        input_resolver: resolver(),
        authority_override: true
      }
    }), '0.12.0-dev.3'),
    /exactly input_resolver/
  );
});

test('repository resolver declaration is exact and cannot widen target constraints', () => {
  assert.deepEqual(normalizeRepositoryDocsResolverDeclaration(resolver()), resolver());
  for (const changed of [
    { id: 'arbitrary-json.v1' },
    { repository: 'other/repository' },
    { base_branch: 'unsafe' },
    { path_policy_digest: '0'.repeat(64) },
    { max_plan_lifetime_ms: 60 * 60 * 1000 },
    { execution_authorized: true }
  ]) {
    assert.throws(
      () => normalizeRepositoryDocsResolverDeclaration(resolver(changed)),
      /not implemented|ceiling|digest|lifetime|unsupported fields/
    );
  }
});

test('production registry/policy/capability state cannot admit the resolver mapping', () => {
  assert.deepEqual(normalizeIntentExecutorRegistry(productionRegistry).mappings, []);
  assert.equal(productionPolicy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action], undefined);
  assert.throws(
    () => deriveRepositoryDocsResolverAdmissionFacts({
      candidate_mapping: resolverMapping(),
      executor_registry: productionRegistry,
      policy: productionPolicy,
      capabilities: productionCapabilities
    }),
    /target action does not exist/
  );
});

test('explicit test-only current state derives exact non-executing resolver admission facts', () => {
  const facts = deriveRepositoryDocsResolverAdmissionFacts({
    candidate_mapping: resolverMapping(),
    executor_registry: productionRegistry,
    policy: policy(),
    capabilities: capabilities()
  });

  assert.equal(facts.schema, 'axiom-intent-resolver-admission-facts.v1');
  assert.equal(facts.input_mode, 'input_resolver');
  assert.equal(facts.mapping.fixed_input, null);
  assert.deepEqual(facts.resolver, resolver());
  assert.equal(facts.resolver_digest, digestObject(resolver()));
  assert.equal(facts.effect_destination, repositoryDocsEffectDestination());
  assert.equal(facts.effect_destination, 'github:Zoverions/AXIOM-MESH');
  assert.equal(facts.policy_gates.risk, 'high');
  assert.deepEqual(facts.policy_gates.required_scopes, ['repository:docs:write']);
  assert.equal(facts.policy_gates.required_confirmations, 1);
  assert.deepEqual(
    facts.policy_gates.required_confirmation_values,
    ['confirm:repository.docs.pull-request.create']
  );
  assert.equal(facts.policy_gates.requires_independent_approval, true);
  assert.equal(facts.mapping_constraints_mode, 'resolver_owned_exact');
  assert.equal(facts.mapping_installed, false);
  assert.equal(facts.execution_authorized, false);
  const { facts_digest: ignored, ...body } = facts;
  assert.equal(facts.facts_digest, digestObject(body));
});

test('resolver admission fails on target substitution, existing semantic action, policy denial/tool drift, or disabled capability', () => {
  assert.throws(
    () => deriveRepositoryDocsResolverAdmissionFacts({
      candidate_mapping: resolverMapping({ target_action: 'system.echo' }),
      executor_registry: productionRegistry,
      policy: policy(),
      capabilities: capabilities()
    }),
    /outside the repository-docs executor ceiling/
  );

  const occupiedRegistry = {
    schema: 'axiom-intent-remediation-executor-registry.v1',
    kernel_version: '0.12.0-dev.3',
    mappings: [fixedMapping({
      semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action
    })]
  };
  assert.throws(
    () => deriveRepositoryDocsResolverAdmissionFacts({
      candidate_mapping: resolverMapping(),
      executor_registry: occupiedRegistry,
      policy: policy(),
      capabilities: capabilities()
    }),
    /already exists/
  );

  const denied = policy();
  denied.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action].decision = 'deny';
  assert.throws(
    () => deriveRepositoryDocsResolverAdmissionFacts({
      candidate_mapping: resolverMapping(),
      executor_registry: productionRegistry,
      policy: denied,
      capabilities: capabilities()
    }),
    /denied/
  );

  const wrongTool = policy();
  wrongTool.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action].tool = 'builtin.echo';
  assert.throws(
    () => deriveRepositoryDocsResolverAdmissionFacts({
      candidate_mapping: resolverMapping(),
      executor_registry: productionRegistry,
      policy: wrongTool,
      capabilities: capabilities()
    }),
    /does not match current policy/
  );

  const disabled = capabilities();
  disabled.capabilities.find(
    item => item.id === REPOSITORY_DOCS_EFFECT_POLICY.capability_id
  ).status = 'disabled';
  assert.throws(
    () => deriveRepositoryDocsResolverAdmissionFacts({
      candidate_mapping: resolverMapping(),
      executor_registry: productionRegistry,
      policy: policy(),
      capabilities: disabled
    }),
    /not currently implemented/
  );
});

test('resolver facts are deterministic and bind exact current policy/capability/registry state', () => {
  const first = deriveRepositoryDocsResolverAdmissionFacts({
    candidate_mapping: resolverMapping(),
    executor_registry: productionRegistry,
    policy: policy(),
    capabilities: capabilities()
  });
  const second = deriveRepositoryDocsResolverAdmissionFacts({
    candidate_mapping: resolverMapping(),
    executor_registry: productionRegistry,
    policy: policy(),
    capabilities: capabilities()
  });
  assert.equal(canonicalJson(first), canonicalJson(second));

  const changedPolicy = policy();
  changedPolicy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action].constraints.generation = 2;
  const changed = deriveRepositoryDocsResolverAdmissionFacts({
    candidate_mapping: resolverMapping(),
    executor_registry: productionRegistry,
    policy: changedPolicy,
    capabilities: capabilities()
  });
  assert.notEqual(changed.policy_digest, first.policy_digest);
  assert.notEqual(changed.facts_digest, first.facts_digest);
});
