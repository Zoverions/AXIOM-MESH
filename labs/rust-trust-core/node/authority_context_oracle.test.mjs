import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { evaluateAuthorityComposition } from '../../../mesh/src/lib/authority-composition-guard.mjs';
import {
  STAGE5B_NOW,
  parseAuthorityContextFixture,
  runAuthorityContextFixtureText,
  structurallyAdmitAuthorityContext,
  validateRestrictedJsonLine
} from './authority_context_oracle.mjs';

const fixtureUrl = new URL('../fixtures/authority-context-v0.jsonl', import.meta.url);
const invalidFixtureUrl = new URL('../fixtures/authority-context-v0-invalid.jsonl', import.meta.url);
const validFixtureText = await readFile(fixtureUrl, 'utf8');
const invalidFixtureText = await readFile(invalidFixtureUrl, 'utf8');

function caseById(cases, caseId) {
  const candidate = cases.find(entry => entry.case_id === caseId);
  assert.ok(candidate, `fixture must contain ${caseId}`);
  return candidate;
}

test('Stage 5B restricted JSON preflight rejects transport that JSON.parse would normalize', () => {
  assert.throws(() => validateRestrictedJsonLine('{"x":true,"x":false}'), /duplicate/i);
  assert.throws(() => validateRestrictedJsonLine('{"x":1}'), /admit|number|value/i);
  assert.throws(() => validateRestrictedJsonLine('{"x":"\\u0061"}'), /escape/i);
  assert.doesNotThrow(() => validateRestrictedJsonLine('{"x":"quote:\\" slash:\\\\"}'));
});

test('Stage 5B fixture parser preserves the exact six-field laboratory envelope', () => {
  const cases = parseAuthorityContextFixture(validFixtureText);
  assert.equal(cases.length, 11);
  assert.deepEqual(
    Object.keys(cases[0]).sort(),
    ['case_id', 'grant', 'history', 'intent', 'request', 'restrictions']
  );

  const missingHistory = invalidFixtureText
    .split('\n')
    .find(line => line.includes('"case_id":"missing_top_level_history"'));
  assert.ok(missingHistory);
  assert.throws(() => parseAuthorityContextFixture(`${missingHistory}\n`), /envelope|field/i);
});

test('Stage 5B oracle reports semantic denial as structural admission', () => {
  const cases = parseAuthorityContextFixture(validFixtureText);
  const expired = caseById(cases, 'expired_but_structural');
  const supported = evaluateAuthorityComposition({
    grant: expired.grant,
    intent: expired.intent,
    request: expired.request,
    history: expired.history,
    restrictions: expired.restrictions,
    now: STAGE5B_NOW
  });
  assert.equal(supported.allow, false);
  assert.deepEqual(structurallyAdmitAuthorityContext(expired), {
    caseId: 'expired_but_structural',
    structurallyAdmitted: true
  });
});

test('Stage 5B oracle converts supported structural ValidationError to admission false', () => {
  const grantVerifiedFalse = invalidFixtureText
    .split('\n')
    .find(line => line.includes('"case_id":"grant_verified_false"'));
  assert.ok(grantVerifiedFalse);
  const [candidate] = parseAuthorityContextFixture(`${grantVerifiedFalse}\n`);
  assert.deepEqual(structurallyAdmitAuthorityContext(candidate), {
    caseId: 'grant_verified_false',
    structurallyAdmitted: false
  });
});

test('Stage 5B oracle output has exactly two columns and no authorization output', () => {
  const output = runAuthorityContextFixtureText(validFixtureText);
  const lines = output.split('\n');
  assert.equal(lines.length, 11);
  for (const line of lines) {
    assert.equal(line.split('\t').length, 2);
    assert.match(line, /^[A-Za-z0-9_.:/-]+\t(?:true|false)$/);
  }
  assert.doesNotMatch(output, /authority_effect|bounded-request-admissible|grant-expired/);
});
