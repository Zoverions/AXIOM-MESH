import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixtureUrl = new URL('../../agent-commons/implementation-ambiguity-fixtures.v1.json', import.meta.url);

async function loadCorpus() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

test('independent implementation ambiguity corpus is portable, non-authoritative and evidence-bound', async () => {
  const corpus = await loadCorpus();

  assert.equal(corpus.schema, 'axiom-independent-implementation-ambiguity-fixtures.v1');
  assert.equal(corpus.target, 'RT-AUTH-001');
  assert.equal(corpus.portable, true);
  assert.equal(corpus.production_conformance_claimed, false);
  assert.equal(corpus.authority_granted, false);

  assert.deepEqual(corpus.classification, {
    equivalent_outputs: 'CONSISTENT',
    security_relevant_divergence: 'SPEC_AMBIGUOUS',
    insufficient_evidence: 'INCONCLUSIVE'
  });

  assert.match(corpus.rules.join('\n'), /MUST NOT silently normalize disagreement/i);
  assert.match(corpus.rules.join('\n'), /MUST NOT create local effect authority/i);
  assert.match(corpus.rules.join('\n'), /exact specification revision/i);

  for (const required of [
    'specification_revision',
    'fixture_revision',
    'implementation_a_revision',
    'implementation_b_revision',
    'environment_a',
    'environment_b',
    'raw_output_a',
    'raw_output_b',
    'classification'
  ]) assert.ok(corpus.evidence_record.required.includes(required), required);

  assert.deepEqual(
    corpus.evidence_record.allowed_classifications,
    ['CONSISTENT', 'SPEC_AMBIGUOUS', 'INCONCLUSIVE']
  );
});

test('corpus covers signature semantics, provenance, scope, replay, grant binding and currentness ambiguity', async () => {
  const corpus = await loadCorpus();
  const ids = new Set(corpus.cases.map(({ id }) => id));

  assert.equal(corpus.cases.length, 9);
  assert.equal(ids.size, corpus.cases.length);

  for (const required of [
    'signed-field-coverage',
    'duplicate-and-unknown-fields',
    'canonicalization-equivalence',
    'parent-provenance-binding',
    'scope-equality-vs-escalation',
    'policy-version-replay',
    'cross-org-grant-identifier-binding',
    'revocation-source-unreachable',
    'static-ceiling-dynamic-broader-policy'
  ]) assert.ok(ids.has(required), required);

  for (const entry of corpus.cases) {
    assert.equal(entry.on_divergence, 'SPEC_AMBIGUOUS', entry.id);
    assert.ok(Array.isArray(entry.compare) && entry.compare.length > 0, entry.id);
    assert.ok(entry.security_invariant, entry.id);
  }
});

test('authority-sensitive ambiguity fixtures fail closed or preserve the static ceiling', async () => {
  const corpus = await loadCorpus();
  const byId = new Map(corpus.cases.map((entry) => [entry.id, entry]));

  assert.equal(byId.get('scope-equality-vs-escalation').expected_authority, 'no_execute');
  assert.equal(byId.get('policy-version-replay').expected_decision, 'deny');
  assert.equal(byId.get('revocation-source-unreachable').expected_decision, 'deny_or_indeterminate_no_authority');
  assert.equal(byId.get('static-ceiling-dynamic-broader-policy').expected_authority, 'read_only');

  assert.match(
    byId.get('parent-provenance-binding').security_invariant,
    /cannot be substituted without invalidating authenticated provenance/i
  );
  assert.match(
    byId.get('duplicate-and-unknown-fields').security_invariant,
    /cannot create alternate signed meanings or widen authority/i
  );
});
