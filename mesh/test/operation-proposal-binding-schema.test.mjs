import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  OPERATION_PROPOSAL_BINDING_LIMITS,
  OPERATION_PROPOSAL_BINDING_REASONS,
  OPERATION_PROPOSAL_BINDING_SCHEMA,
  OPERATION_PROPOSAL_BINDING_SCHEMA_ID,
  OPERATION_PROPOSAL_BINDING_STATUSES,
  verifyOperationProposalBinding
} from '../src/lib/operation-proposal-binding.mjs';

const schemaUrl = new URL(
  '../../docs/architecture/contracts/operation-proposal-binding.v0.schema.json',
  import.meta.url
);

function conforms(schema, value, path = '$') {
  if (schema.anyOf) {
    const ok = schema.anyOf.some((branch) => {
      try {
        conforms(branch, value, path);
        return true;
      } catch {
        return false;
      }
    });
    if (!ok) throw new Error(`${path} matches no anyOf branch`);
    return;
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const) throw new Error(`${path} const`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path} enum`);
  if (schema.type === 'null' && value !== null) throw new Error(`${path} null`);
  if (schema.type === 'string') {
    if (typeof value !== 'string') throw new Error(`${path} string`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) throw new Error(`${path} pattern`);
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`${path} array`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw new Error(`${path} maxItems`);
    value.forEach((item, index) => conforms(schema.items, item, `${path}[${index}]`));
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} object`);
    for (const key of schema.required) {
      if (!Object.hasOwn(value, key)) throw new Error(`${path}.${key} required`);
    }
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) throw new Error(`${path}.${key} additional`);
      conforms(schema.properties[key], value[key], `${path}.${key}`);
    }
  }
}

function everyObjectClosed(node) {
  if (!node || typeof node !== 'object') return true;
  if (Array.isArray(node)) return node.every(everyObjectClosed);
  if (node.type === 'object' && node.additionalProperties !== false) return false;
  return Object.values(node).every(everyObjectClosed);
}

test('Operation Proposal Binding v0 schema mirrors the closed document and hard zeros', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$id, OPERATION_PROPOSAL_BINDING_SCHEMA_ID);
  assert.equal(schema.properties.schema.const, OPERATION_PROPOSAL_BINDING_SCHEMA);
  assert.equal(everyObjectClosed(schema), true);
  for (const field of ['authority_effect', 'assurance_effect', 'currentness_effect', 'execution_effect', 'network_effect']) {
    assert.equal(schema.properties[field].const, 'none', field);
  }
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.authorization_result.const, 'not-evaluated');
  assert.deepEqual(schema.properties.binding_status.enum, [...OPERATION_PROPOSAL_BINDING_STATUSES]);
  assert.deepEqual(schema.properties.rejection_reason.anyOf[0].enum, [...OPERATION_PROPOSAL_BINDING_REASONS]);
  assert.equal(schema.properties.bound_operations.maxItems, OPERATION_PROPOSAL_BINDING_LIMITS.max_proposed_operations);
  assert.equal(schema['x-axiom-limits'].max_candidates, OPERATION_PROPOSAL_BINDING_LIMITS.max_candidates);
  assert.deepEqual(Object.keys(schema.properties).sort(), [...schema.required].sort());
});

test('verifier outputs (rejected) conform to the wire schema', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  const rejected = verifyOperationProposalBinding({});
  assert.equal(rejected.binding_status, 'rejected');
  assert.deepEqual(Object.keys(rejected).sort(), [...schema.required].sort());
  conforms(schema, rejected);
});
