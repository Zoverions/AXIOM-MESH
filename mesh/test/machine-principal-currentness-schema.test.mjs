import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SCHEMAS = Object.freeze([
  {
    file: 'machine-principal-mutation-authorization-v1.schema.json',
    id: 'https://axiom.invalid/schemas/machine-principal-mutation-authorization-v1.schema.json',
    schema: 'axiom-machine-principal-mutation-authorization.v1',
    required: [
      'schema',
      'actor_id',
      'target_principal_id',
      'target_principal_type',
      'root_authority_digest',
      'predecessor_lifecycle_seq',
      'predecessor_lifecycle_head_digest',
      'predecessor_authority_digest',
      'transition_kind',
      'successor_authority_digest',
      'reason',
      'policy_version',
      'policy_digest',
      'operation',
      'intent_id',
      'issued_at',
      'effective_at',
      'expires_at',
      'command_id'
    ]
  },
  {
    file: 'machine-principal-lifecycle-transition-v1.schema.json',
    id: 'https://axiom.invalid/schemas/machine-principal-lifecycle-transition-v1.schema.json',
    schema: 'axiom-machine-principal-lifecycle-transition.v1',
    required: [
      'schema',
      'principal_id',
      'principal_type',
      'root_authority_digest',
      'predecessor_lifecycle_seq',
      'predecessor_lifecycle_head_digest',
      'predecessor_authority_digest',
      'successor_lifecycle_seq',
      'successor_status',
      'successor_authority_digest',
      'successor_authority',
      'command_id',
      'command_digest',
      'mutation_authorization_digest',
      'actor_id',
      'policy_version',
      'policy_digest',
      'reason',
      'effective_at'
    ]
  },
  {
    file: 'machine-principal-currentness-projection-v1.schema.json',
    id: 'https://axiom.invalid/schemas/machine-principal-currentness-projection-v1.schema.json',
    schema: 'axiom-machine-principal-currentness-projection.v1',
    required: [
      'schema',
      'principal_id',
      'principal_type',
      'root_authority_digest',
      'retained_status',
      'effective_status',
      'lifecycle_seq',
      'lifecycle_head_event_id',
      'lifecycle_head_event_hash',
      'lifecycle_head_digest',
      'effective_authority_digest',
      'effective_authority',
      'grid_chain_seq',
      'grid_chain_head',
      'observed_at',
      'authority_effect'
    ]
  },
  {
    file: 'machine-effect-release-v1.schema.json',
    id: 'https://axiom.invalid/schemas/machine-effect-release-v1.schema.json',
    schema: 'axiom-machine-effect-release.v1',
    required: [
      'schema',
      'release_id',
      'principal_id',
      'principal_type',
      'capability_id',
      'execution_attempt_id',
      'sandbox_execution_epoch',
      'intent_id',
      'plan_digest',
      'action',
      'destination',
      'root_authority_digest',
      'lifecycle_seq',
      'lifecycle_head_digest',
      'effective_authority_digest',
      'consumption_receipt_digest',
      'released_at',
      'authority_effect'
    ]
  }
]);

async function readSchema(file) {
  return JSON.parse(await readFile(
    new URL('../config/' + file, import.meta.url),
    'utf8'
  ));
}

test('machine currentness v1 JSON schemas pin exact top-level contracts', async () => {
  for (const expected of SCHEMAS) {
    const schema = await readSchema(expected.file);

    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.$id, expected.id);
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.schema.const, expected.schema);
    assert.deepEqual(
      [...schema.required].sort(),
      [...expected.required].sort(),
      expected.file
    );
    assert.deepEqual(
      Object.keys(schema.properties).sort(),
      [...expected.required].sort(),
      expected.file
    );
  }
});

test('machine authority object schemas are closed at every authority layer', async () => {
  for (const file of [
    'machine-principal-lifecycle-transition-v1.schema.json',
    'machine-principal-currentness-projection-v1.schema.json'
  ]) {
    const schema = await readSchema(file);
    const authority = schema.$defs.machineAuthority;

    assert.equal(authority.type, 'object');
    assert.equal(authority.additionalProperties, false);
    assert.equal(authority.properties.runtime.additionalProperties, false);
    assert.equal(authority.properties.constraints.additionalProperties, false);
    assert.equal(
      authority.properties.constraints.properties.budgets.additionalProperties,
      false
    );
    assert.equal(
      authority.properties.constraints.properties.delegation.additionalProperties,
      false
    );
  }
});

test('mutation schema permits null predecessor only for initialize-shaped records at JS boundary', async () => {
  const schema = await readSchema(
    'machine-principal-mutation-authorization-v1.schema.json'
  );

  assert.deepEqual(
    schema.properties.predecessor_lifecycle_seq.type.sort(),
    ['integer', 'null']
  );
  assert.deepEqual(
    schema.properties.predecessor_lifecycle_head_digest.type.sort(),
    ['null', 'string']
  );
  assert.deepEqual(
    schema.properties.predecessor_authority_digest.type.sort(),
    ['null', 'string']
  );
  assert.deepEqual(schema.properties.transition_kind.enum, [
    'initialize',
    'narrow',
    'revoke',
    'compromise',
    'expire'
  ]);
});

test('currentness projection fixes non-authorizing evidence semantics', async () => {
  const schema = await readSchema(
    'machine-principal-currentness-projection-v1.schema.json'
  );

  assert.deepEqual(schema.properties.retained_status.enum, [
    'active',
    'narrowed',
    'revoked',
    'compromised',
    'expired'
  ]);
  assert.deepEqual(schema.properties.effective_status.enum, [
    'active',
    'narrowed',
    'revoked',
    'compromised',
    'expired'
  ]);
  assert.equal(schema.properties.authority_effect.const, 'none');
});

test('effect release schema is exact-attempt authority rather than transferable bearer authority', async () => {
  const schema = await readSchema('machine-effect-release-v1.schema.json');

  assert.equal(
    schema.properties.authority_effect.const,
    'exact-machine-effect-release'
  );
  assert.equal(
    schema.properties.execution_attempt_id.pattern,
    '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$'
  );
  assert.equal(
    schema.properties.sandbox_execution_epoch.pattern,
    '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$'
  );
});
