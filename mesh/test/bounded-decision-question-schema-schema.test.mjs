import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/bounded-decision-question-schema-v0.schema.json', import.meta.url);

test('Bounded Decision Question Schema v0 mirrors the three closed question variants', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$id, 'https://axiom.invalid/schemas/bounded-decision-question-schema-v0.schema.json');
  assert.equal(Array.isArray(schema.oneOf), true);
  assert.equal(schema.oneOf.length, 3);

  const [choice, score, binary] = schema.oneOf;
  for (const variant of schema.oneOf) {
    assert.equal(variant.type, 'object');
    assert.equal(variant.additionalProperties, false);
    assert.equal(variant.properties.schema.const, 'axiom-bounded-decision-question-schema.v0');
    assert.equal(variant.properties.version.const, 0);
    assert.equal(variant.properties.status.const, 'inert-bounded-decision-question-schema');
    assert.equal(variant.properties.schema_digest.$ref, '#/$defs/sha256');
    assert.equal(variant.properties.authority_effect, undefined);
    assert.equal(variant.properties.tool, undefined);
    assert.equal(variant.properties.chain_of_thought, undefined);
  }

  assert.equal(choice.properties.question_kind.const, 'choice');
  assert.equal(choice.properties.options.minItems, 2);
  assert.equal(choice.properties.options.maxItems, 64);
  assert.deepEqual(choice.properties.other_option_policy.enum, ['required', 'allowed', 'forbidden']);

  assert.equal(score.properties.question_kind.const, 'score');
  assert.equal(score.properties.levels.minItems, 2);
  assert.equal(score.properties.levels.maxItems, 10);

  assert.equal(binary.properties.question_kind.const, 'binary-probability');
  assert.equal(binary.required.includes('true_meaning'), true);
  assert.equal(binary.required.includes('false_meaning'), true);

  assert.equal(schema.$defs.option.additionalProperties, false);
  assert.equal(schema.$defs.level.additionalProperties, false);
  assert.equal(schema.$defs.option.required.includes('option_id'), true);
  assert.equal(schema.$defs.level.required.includes('position'), true);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/bounded-decision-question-schema.mjs'
  );
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('digest')));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('atomic')));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('other') || rule.includes('none')));
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'authority-grant',
    'tool-execution',
    'runtime-activation',
    'semantic-correctness',
    'calibration-truth',
    'chain-of-thought-provenance'
  ]);
});
