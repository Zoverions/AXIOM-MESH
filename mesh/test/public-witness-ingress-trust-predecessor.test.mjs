import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  createPublicWitnessAuthenticatedIngressFromTrustBundle,
  createPublicWitnessIngressTrustBundle,
  verifyPublicWitnessIngressTrustBundleAgainstReceiver
} from '../src/lib/public-witness-ingress-trust.mjs';
import { createPublicWitnessSourceAdmission } from '../src/lib/public-witness-transfer.mjs';
import { sha256 } from '../src/lib/canonical.mjs';

const DOMAIN = 'axiom.social.public.v1';
const T0 = '2026-08-17T23:00:00.000Z';
const T1 = '2026-08-17T23:01:00.000Z';
const T2 = '2026-08-17T23:02:00.000Z';
const TEND = '2026-08-17T23:05:00.000Z';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function keyId(publicKey) {
  return sha256(createPublicKey(publicKey).export({ type: 'spki', format: 'pem' }).toString());
}

function fixture() {
  const source = keys();
  const root = keys();
  const admission = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-predecessor-gate',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: T0,
    expiresAt: TEND
  });
  const roots = [{ key_id: keyId(root.publicKey), public_key: root.publicKey }];
  const first = createPublicWitnessIngressTrustBundle({
    domainId: DOMAIN,
    generation: 1,
    activatedAt: T0,
    sources: [{ certificate_sha256: 'a'.repeat(64), admission }],
    personaRoots: roots
  });
  const second = createPublicWitnessIngressTrustBundle({
    domainId: DOMAIN,
    generation: 2,
    previousBundle: first,
    activatedAt: T1,
    sources: [{ certificate_sha256: 'b'.repeat(64), admission }],
    personaRoots: roots
  });
  const receiverStore = {
    getSourceAdmission(admissionDigest) {
      return admissionDigest === admission.admission_digest ? structuredClone(admission) : null;
    },
    snapshot() {
      return { domain_id: DOMAIN };
    },
    async receiveTransfer() {
      throw new Error('not reached');
    }
  };
  return { first, second, receiverStore };
}

test('non-genesis operational trust cannot activate without its exact predecessor bundle', () => {
  const data = fixture();
  assert.throws(
    () => verifyPublicWitnessIngressTrustBundleAgainstReceiver({
      receiverStore: data.receiverStore,
      bundle: data.second
    }),
    /requires its predecessor bundle/
  );
  assert.throws(
    () => createPublicWitnessAuthenticatedIngressFromTrustBundle({
      receiverStore: data.receiverStore,
      bundle: data.second,
      clock: () => Date.parse(T2)
    }),
    /requires its predecessor bundle/
  );
});

test('genesis operational trust refuses a spurious predecessor', () => {
  const data = fixture();
  assert.throws(
    () => verifyPublicWitnessIngressTrustBundleAgainstReceiver({
      receiverStore: data.receiverStore,
      bundle: data.first,
      previousBundle: data.first
    }),
    /genesis activation cannot supply a predecessor/
  );
});
