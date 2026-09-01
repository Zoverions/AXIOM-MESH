import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createPresentationTransformationReceipt,
  validatePresentationTransformationPolicy
} from '../../packages/axiom-social-feed-policy/presentation-transformation.mjs';

const policyUrl = new URL('../config/social-presentation-transformation.v0.json', import.meta.url);

async function loadPolicy() {
  return JSON.parse(await readFile(policyUrl, 'utf8'));
}

test('presentation transformation policy is owner-local and cannot mutate canonical source', async () => {
  const policy = await loadPolicy();
  assert.equal(validatePresentationTransformationPolicy(policy), true);
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.canonical_source_mutation, false);
  assert.equal(policy.scope.user_preference_only, true);
  assert.equal(policy.scope.third_party_visibility_effect, false);
  assert.equal(policy.scope.network_distribution_effect, false);
  assert.equal(policy.authority_effect, 'none');
  assert.equal(policy.network_effect, 'none');
});

test('softened local rendering records source and rendered digests without claiming exact authorship', async () => {
  const policy = await loadPolicy();
  const receipt = createPresentationTransformationReceipt(policy, {
    sourceDigest: 'a'.repeat(64),
    renderedDigest: 'b'.repeat(64),
    presentationPolicyDigest: 'c'.repeat(64),
    mode: 'soften-local-rendering',
    transformedAt: '2026-08-20T16:40:00.000Z'
  });
  assert.equal(receipt.source_digest, 'a'.repeat(64));
  assert.equal(receipt.rendered_digest, 'b'.repeat(64));
  assert.equal(receipt.canonical_source_mutated, false);
  assert.equal(receipt.author_exact_words_claimed, false);
  assert.equal(receipt.owner_scope, 'local');
  assert.equal(receipt.network_effect, 'none');
});

test('show-original requires byte-identity commitment and may identify itself as exact author words', async () => {
  const policy = await loadPolicy();
  const receipt = createPresentationTransformationReceipt(policy, {
    sourceDigest: 'a'.repeat(64),
    renderedDigest: 'a'.repeat(64),
    presentationPolicyDigest: 'c'.repeat(64),
    mode: 'show-original',
    transformedAt: '2026-08-20T16:41:00.000Z'
  });
  assert.equal(receipt.author_exact_words_claimed, true);
  assert.throws(
    () => createPresentationTransformationReceipt(policy, {
      sourceDigest: 'a'.repeat(64),
      renderedDigest: 'b'.repeat(64),
      presentationPolicyDigest: 'c'.repeat(64),
      mode: 'show-original',
      transformedAt: '2026-08-20T16:41:00.000Z'
    }),
    /must equal the source digest/
  );
});

test('transformed modes cannot masquerade as unchanged source bytes', async () => {
  const policy = await loadPolicy();
  for (const mode of [
    'mask-selected-terms',
    'soften-local-rendering',
    'summarize-before-reveal',
    'warning-before-reveal'
  ]) {
    assert.throws(
      () => createPresentationTransformationReceipt(policy, {
        sourceDigest: 'a'.repeat(64),
        renderedDigest: 'a'.repeat(64),
        presentationPolicyDigest: 'c'.repeat(64),
        mode,
        transformedAt: '2026-08-20T16:42:00.000Z'
      }),
      /must not claim an unchanged rendered digest/
    );
  }
});

test('original remains one action away where lawful and safe and curator cannot remove that access', async () => {
  const policy = await loadPolicy();
  validatePresentationTransformationPolicy(policy);
  assert.equal(policy.original_access.available_when_lawful_and_safe, true);
  assert.equal(policy.original_access.maximum_user_actions, 1);
  assert.equal(policy.original_access.transformed_view_may_disable_original_access, false);
  assert.equal(policy.original_access.curator_may_disable_original_access, false);
  assert.equal(policy.authorship.transformed_rendering_may_be_exported_as_author_source, false);
  assert.equal(policy.authorship.transformed_rendering_may_be_quoted_as_exact_without_reveal, false);
});
