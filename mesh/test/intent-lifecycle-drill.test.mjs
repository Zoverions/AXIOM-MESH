import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runIntentLifecycleDrill,
  verifyIntentLifecycleEvidence
} from '../src/intent-lifecycle-drill.mjs';

const REVISION = /^[a-f0-9]{40}$/;
let evidencePromise;

function lifecycleEvidence() {
  evidencePromise ??= runIntentLifecycleDrill({
    sourceRevision: process.env.GITHUB_SHA
  });
  return evidencePromise;
}

test('AXIOM Intent lifecycle traverses the real four-service stack and emits signed evidence', async () => {
  const evidence = await lifecycleEvidence();
  const verified = verifyIntentLifecycleEvidence(evidence);
  assert.equal(verified.valid, true);
  assert.equal(verified.commit_bound, REVISION.test(process.env.GITHUB_SHA ?? ''));
  assert.equal(evidence.status, 'passed');
  assert.equal(evidence.lifecycle.execution_authorized, false);
  assert.equal(evidence.production_promotion_claimed, false);
  assert.equal(evidence.reconciliation_execution_claimed, false);
  assert.ok(Object.keys(evidence.checks).length >= 20);
  assert.ok(Object.values(evidence.checks).every(Boolean));

  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /intent-operator-[0-9a-f-]{36}-o{24}/);
  assert.doesNotMatch(serialized, /intent-approver-[0-9a-f-]{36}-a{24}/);
  assert.doesNotMatch(serialized, /intent-verifier-a-[0-9a-f-]{36}-x{24}/);
  assert.doesNotMatch(serialized, /intent-verifier-b-[0-9a-f-]{36}-y{24}/);
  assert.doesNotMatch(serialized, /intent-verifier-c-[0-9a-f-]{36}-z{24}/);
});

test('Intent lifecycle evidence rejects tampering and false execution/promotion claims', async () => {
  const evidence = await lifecycleEvidence();

  const tamperedCheck = structuredClone(evidence);
  tamperedCheck.checks.grid_chain_verified_after_lifecycle = false;
  assert.throws(
    () => verifyIntentLifecycleEvidence(tamperedCheck),
    /fields are invalid|signature is invalid/
  );

  const falsePromotion = structuredClone(evidence);
  falsePromotion.production_promotion_claimed = true;
  assert.throws(
    () => verifyIntentLifecycleEvidence(falsePromotion),
    /fields are invalid/
  );

  const falseExecution = structuredClone(evidence);
  falseExecution.lifecycle.execution_authorized = true;
  assert.throws(
    () => verifyIntentLifecycleEvidence(falseExecution),
    /fields are invalid/
  );

  const wrongRevision = structuredClone(evidence);
  if (wrongRevision.source.commit_bound) {
    wrongRevision.source.revision = `${wrongRevision.source.revision.slice(0, 39)}${
      wrongRevision.source.revision.endsWith('0') ? '1' : '0'
    }`;
  } else {
    wrongRevision.source.source_digest = 'f'.repeat(64);
  }
  assert.throws(
    () => verifyIntentLifecycleEvidence(wrongRevision),
    /source digest|signature/
  );
});
