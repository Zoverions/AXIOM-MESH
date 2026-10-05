import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  decodeIntentAttenuationRow,
  evaluateIntentAttenuationCase,
  parseIntentAttenuationFixture,
  runIntentAttenuationFixture,
  runIntentAttenuationFixtureText
} from './intent_attenuation_oracle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '..', 'fixtures', 'intent-attenuation-v0.tsv');
const INVALID_FIXTURE = join(HERE, '..', 'fixtures', 'intent-attenuation-v0-invalid.tsv');
const ORACLE = join(HERE, 'intent_attenuation_oracle.mjs');

function decodeEscapedRow(encoded) {
  return encoded.replaceAll('\\t', '\t').replaceAll('\\n', '\n');
}

test('Stage 5A oracle decodes the frozen attenuation transport grammar', () => {
  assert.deepEqual(
    decodeIntentAttenuationRow(
      'subset\ttrue\ttrue\taction:a,action:b\tpurpose:a\tdestination:a\tresource:a\taction:b\tpurpose:a\tdestination:a\tresource:a'
    ),
    {
      caseId: 'subset',
      grantVerified: true,
      intentBound: true,
      grantActions: ['action:a', 'action:b'],
      grantPurposes: ['purpose:a'],
      grantDestinations: ['destination:a'],
      grantResources: ['resource:a'],
      intentActions: ['action:b'],
      intentPurposes: ['purpose:a'],
      intentDestinations: ['destination:a'],
      intentResources: ['resource:a']
    }
  );
});

test('Stage 5A oracle calls supported Node attenuation semantics', () => {
  const result = evaluateIntentAttenuationCase(
    decodeIntentAttenuationRow(
      'widen\ttrue\ttrue\taction:a\tpurpose:a\tdestination:a\tresource:a\taction:a,action:z\tpurpose:a\tdestination:a\tresource:a'
    )
  );
  assert.deepEqual(result, {
    valid: false,
    checks: {
      actions: false,
      purposes: true,
      destinations: true,
      resources: true
    }
  });
});

test('Stage 5A fixture execution exposes expected subset and widening cases', async () => {
  const output = await runIntentAttenuationFixture(FIXTURE);
  const lines = output.split('\n');
  assert.equal(lines.includes('exact_single\ttrue\ttrue\ttrue\ttrue\ttrue'), true);
  assert.equal(lines.includes('widen_actions\tfalse\tfalse\ttrue\ttrue\ttrue'), true);
  assert.equal(lines.includes('widen_resources\tfalse\ttrue\ttrue\ttrue\tfalse'), true);
  assert.equal(lines.includes('disjoint_all\tfalse\tfalse\tfalse\tfalse\tfalse'), true);
});

test('Stage 5A fixture-text execution is identical to file execution', async () => {
  const text = await readFile(FIXTURE, 'utf8');
  assert.equal(runIntentAttenuationFixtureText(text), await runIntentAttenuationFixture(FIXTURE));
});

test('Stage 5A oracle CLI accepts fixture text over stdin', async () => {
  const text = await readFile(FIXTURE, 'utf8');
  const expected = await runIntentAttenuationFixture(FIXTURE);
  const result = spawnSync(process.execPath, [ORACLE, '-'], {
    input: text,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${expected}\n`);
});

test('Stage 5A oracle stdin reader concatenates only after collecting chunks', async () => {
  const source = await readFile(ORACLE, 'utf8');
  assert.equal(/\btext\s*\+=\s*chunk\b/.test(source), false);
  assert.match(source, /chunks\.push\(chunk\)/);
  assert.match(source, /return chunks\.join\(''\)/);
});

test('Stage 5A fixture parser preserves every case id exactly once', async () => {
  const cases = parseIntentAttenuationFixture(await readFile(FIXTURE, 'utf8'));
  assert.equal(cases.length, 16);
  assert.equal(new Set(cases.map(item => item.caseId)).size, cases.length);
});

test('Stage 5A oracle fails closed on every malformed, unverified, or unbound row', async () => {
  const lines = (await readFile(INVALID_FIXTURE, 'utf8')).trimEnd().split('\n');
  assert.equal(lines.shift(), 'case_id\tencoded_row');
  assert.equal(lines.length, 12);

  for (const line of lines) {
    const separator = line.indexOf('\t');
    assert.notEqual(separator, -1, `invalid corpus row missing separator: ${line}`);
    const caseId = line.slice(0, separator);
    const encoded = line.slice(separator + 1);
    const decoded = decodeEscapedRow(encoded);

    if (caseId === 'unverified_grant' || caseId === 'unbound_intent') {
      const candidate = decodeIntentAttenuationRow(decoded);
      assert.throws(() => evaluateIntentAttenuationCase(candidate), undefined, caseId);
    } else {
      assert.throws(() => decodeIntentAttenuationRow(decoded), undefined, caseId);
    }
  }
});
