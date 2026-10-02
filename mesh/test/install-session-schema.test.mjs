import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cases = [
  {
    file:'install-session-v0.schema.json',
    schema:'axiom-install-session.v0',
    hardZeros:[
      ['host_mutation_authorized',false],
      ['credential_effect','none'],
      ['service_start_effect','none'],
      ['authority_effect','none'],
      ['network_effect','none'],
      ['runtime_activation',false]
    ]
  },
  {
    file:'install-artifact-proof-v0.schema.json',
    schema:'axiom-install-artifact-proof.v0',
    hardZeros:[
      ['artifact_bytes_verified',true],
      ['host_mutation_authorized',false],
      ['credential_effect','none'],
      ['service_start_effect','none'],
      ['authority_effect','none'],
      ['network_effect','none'],
      ['runtime_activation',false]
    ]
  }
];

for (const candidate of cases) {
  test(candidate.file + ' is closed and pins the inert boundary', async () => {
    const schema=JSON.parse(await readFile(
      new URL('../config/' + candidate.file,import.meta.url),
      'utf8'
    ));
    assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.type,'object');
    assert.equal(schema.additionalProperties,false);
    assert.equal(schema.properties.schema.const,candidate.schema);
    for (const [field,value] of candidate.hardZeros) {
      assert.ok(schema.required.includes(field),field + ' must be required');
      assert.equal(schema.properties[field].const,value,field + ' boundary drifted');
    }
  });
}

test('install-session classification and next-preparation vocabularies are closed',async()=>{
  const schema=JSON.parse(await readFile(
    new URL('../config/install-session-v0.schema.json',import.meta.url),
    'utf8'
  ));
  assert.deepEqual(schema.properties.classification.enum,[
    'absent','healthy-same','healthy-older','partial-same','conflicting-partial',
    'newer-or-unknown','legacy-proof-state'
  ]);
  assert.deepEqual(schema.properties.next_preparation.enum,[
    'verify-noop','prepare-install','prepare-repair','prepare-upgrade','stop'
  ]);
  assert.equal(schema.properties.artifact_proofs.items.additionalProperties,false);
});
