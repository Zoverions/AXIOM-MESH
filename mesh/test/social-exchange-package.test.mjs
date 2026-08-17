import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection,
  createSocialPublicationRetraction,
  createSupersedingSocialPublication
} from '../src/lib/social-publication.mjs';
import {
  SOCIAL_EXCHANGE_IMPORT_PLAN_SCHEMA,
  SOCIAL_EXCHANGE_PACKAGE_SCHEMA,
  createSocialExchangeImportPlan,
  createSocialExchangePackage,
  verifySocialExchangePackage
} from '../src/lib/social-exchange-package.mjs';

const T0 = '2026-08-16T18:00:00.000Z';
const T1 = '2026-08-16T18:01:00.000Z';
const T2 = '2026-08-16T18:02:00.000Z';
const T3 = '2026-08-16T18:03:00.000Z';
const T4 = '2026-08-16T18:04:00.000Z';
const T5 = '2026-08-16T19:04:00.000Z';
const NOW = Date.parse(T4);

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function protectedPersona(overrides = {}) {
  return {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-zov',
    controller_actor_id: 'actor-private-zov',
    represented_actor_id: null,
    attribution_mode: 'selectively-attributable',
    public_actor_link: null,
    selective_link_commitment: 'a'.repeat(64),
    delegation_authority_digest: null,
    created_at: T0,
    status: 'active',
    ...overrides
  };
}

function publicationInput(overrides = {}) {
  return {
    publication_id: 'publication-alpha',
    content: {
      media_type: 'text/plain',
      text: 'Portable social state is not network delivery.'
    },
    attachment_digests: [],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: T1,
    supersedes_digest: null,
    ...overrides
  };
}

function fixture() {
  const exporter = keys();
  const persona = protectedPersona();
  const publicPersona = createPublicPersonaProjection(persona);
  const original = createSocialPublicationProjection(publicationInput(), { persona });
  const revision = createSupersedingSocialPublication(original, publicationInput({
    publication_id: 'publication-alpha-r2',
    content: { media_type: 'text/plain', text: 'Revision two remains immutable.' },
    created_at: T2,
    supersedes_digest: undefined
  }), { persona });
  const retraction = createSocialPublicationRetraction(original, {
    reason_code: 'author-retracted',
    occurred_at: T3
  });
  return {
    exporter,
    persona,
    publicPersona,
    original,
    revision,
    retraction
  };
}

function createPackage(data = fixture(), overrides = {}) {
  return createSocialExchangePackage({
    personas: [data.publicPersona],
    publications: [data.revision, data.original],
    transitions: [data.retraction],
    exporterGridId: 'grid-exporter-one',
    exporterPrivateKey: data.exporter.privateKey,
    exporterPublicKey: data.exporter.publicKey,
    createdAt: T3,
    now: NOW,
    ...overrides
  });
}

test('portable social package is deterministic, public-only, and explicitly non-networking', () => {
  const data = fixture();
  const first = createPackage(data);
  const second = createSocialExchangePackage({
    personas: [data.publicPersona],
    publications: [data.original, data.revision],
    transitions: [data.retraction],
    exporterGridId: 'grid-exporter-one',
    exporterPrivateKey: data.exporter.privateKey,
    exporterPublicKey: data.exporter.publicKey,
    createdAt: T3,
    now: NOW
  });

  assert.equal(first.schema, SOCIAL_EXCHANGE_PACKAGE_SCHEMA);
  assert.equal(first.package_digest, second.package_digest);
  assert.equal(first.attestation.signature, second.attestation.signature);
  assert.equal(first.statement.transport_effect, 'none');
  assert.equal(first.statement.authority_effect, 'none');
  assert.equal(first.statement.delivery_claimed, false);
  assert.equal(first.statement.federation_claimed, false);
  assert.equal(first.attestation.scope, 'grid-export');
  assert.equal(first.attestation.actor_signature_claimed, false);
  assert.equal(first.attestation.authorship_claimed, false);
  assert.equal(first.attestation.legal_identity_claimed, false);

  const serialized = JSON.stringify(first);
  assert.equal(serialized.includes(data.persona.controller_actor_id), false);
  assert.equal(serialized.includes('selective_link_commitment'), false);
  assert.equal(serialized.includes('delegation_authority_digest'), false);
  assert.equal(serialized.includes(data.exporter.privateKey), false);
  assert.equal(serialized.includes(data.exporter.publicKey), false);
});

test('verification requires the explicitly trusted exporter key and preserves claim limits', () => {
  const data = fixture();
  const packageValue = createPackage(data);
  const verified = verifySocialExchangePackage(packageValue, {
    trustedExporterPublicKey: data.exporter.publicKey,
    expectedExporterGridId: 'grid-exporter-one',
    now: NOW
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.package_digest, packageValue.package_digest);
  assert.equal(verified.exporter.grid_id, 'grid-exporter-one');
  assert.equal(verified.exporter_attestation.scope, 'grid-export');
  assert.equal(verified.exporter_attestation.actor_signature_claimed, false);
  assert.equal(verified.delivery_claimed, false);
  assert.equal(verified.federation_claimed, false);
  assert.equal(verified.transport_effect, 'none');
  assert.equal(verified.authority_effect, 'none');

  const other = keys();
  assert.throws(
    () => verifySocialExchangePackage(packageValue, {
      trustedExporterPublicKey: other.publicKey,
      now: NOW
    }),
    /trusted exporter key/
  );
  assert.throws(
    () => verifySocialExchangePackage(packageValue, {
      trustedExporterPublicKey: data.exporter.publicKey,
      expectedExporterGridId: 'grid-other',
      now: NOW
    }),
    /expected exporter/
  );
});

test('content-address tampering and private-field injection fail closed', () => {
  const data = fixture();
  const packageValue = createPackage(data);
  const tampered = structuredClone(packageValue);
  tampered.statement.publications[0].content.text = 'tampered remote content';
  assert.throws(
    () => verifySocialExchangePackage(tampered, {
      trustedExporterPublicKey: data.exporter.publicKey,
      now: NOW
    }),
    /digest does not match canonical content/
  );

  const privateLeak = structuredClone(packageValue);
  privateLeak.statement.personas[0].controller_actor_id = 'actor-private-zov';
  assert.throws(
    () => verifySocialExchangePackage(privateLeak, {
      trustedExporterPublicKey: data.exporter.publicKey,
      now: NOW
    }),
    /unsupported field controller_actor_id/
  );
});

test('package construction rejects duplicate identities and broken persona bindings', () => {
  const data = fixture();
  assert.throws(
    () => createSocialExchangePackage({
      personas: [data.publicPersona, data.publicPersona],
      publications: [data.original],
      exporterGridId: 'grid-exporter-one',
      exporterPrivateKey: data.exporter.privateKey,
      exporterPublicKey: data.exporter.publicKey,
      createdAt: T3,
      now: NOW
    }),
    /duplicate persona identities/
  );
  assert.throws(
    () => createSocialExchangePackage({
      personas: [data.publicPersona],
      publications: [data.original, data.original],
      exporterGridId: 'grid-exporter-one',
      exporterPrivateKey: data.exporter.privateKey,
      exporterPublicKey: data.exporter.publicKey,
      createdAt: T3,
      now: NOW
    }),
    /duplicate publication identities/
  );

  const otherPersona = protectedPersona({
    persona_id: 'persona-other',
    controller_actor_id: 'actor-private-other'
  });
  const otherPublication = createSocialPublicationProjection(publicationInput({
    publication_id: 'publication-other'
  }), { persona: otherPersona });
  assert.throws(
    () => createSocialExchangePackage({
      personas: [data.publicPersona],
      publications: [data.original, otherPublication],
      exporterGridId: 'grid-exporter-one',
      exporterPrivateKey: data.exporter.privateKey,
      exporterPublicKey: data.exporter.publicKey,
      createdAt: T3,
      now: NOW
    }),
    /absent persona/
  );
});

test('package construction requires complete supersession lineage', () => {
  const data = fixture();
  const orphanRevision = createSocialPublicationProjection(publicationInput({
    publication_id: 'publication-orphan-r2',
    created_at: T2,
    supersedes_digest: 'f'.repeat(64)
  }), { persona: data.persona });
  assert.throws(
    () => createSocialExchangePackage({
      personas: [data.publicPersona],
      publications: [orphanRevision],
      exporterGridId: 'grid-exporter-one',
      exporterPrivateKey: data.exporter.privateKey,
      exporterPublicKey: data.exporter.publicKey,
      createdAt: T3,
      now: NOW
    }),
    /supersession predecessor is absent/
  );
});

test('package construction rejects retractions for absent publications', () => {
  const data = fixture();
  const otherPersona = protectedPersona({
    persona_id: 'persona-other',
    controller_actor_id: 'actor-private-other'
  });
  const otherPublicPersona = createPublicPersonaProjection(otherPersona);
  const otherPublication = createSocialPublicationProjection(publicationInput({
    publication_id: 'publication-other'
  }), { persona: otherPersona });
  const otherRetraction = createSocialPublicationRetraction(otherPublication, {
    reason_code: 'author-retracted',
    occurred_at: T3
  });
  assert.throws(
    () => createSocialExchangePackage({
      personas: [data.publicPersona, otherPublicPersona],
      publications: [data.original],
      transitions: [otherRetraction],
      exporterGridId: 'grid-exporter-one',
      exporterPrivateKey: data.exporter.privateKey,
      exporterPublicKey: data.exporter.publicKey,
      createdAt: T3,
      now: NOW
    }),
    /retraction references an absent publication/
  );
});

test('false delivery, federation, actor-signature, or authorship claims are rejected', () => {
  const data = fixture();
  const packageValue = createPackage(data);
  for (const [target, key, value] of [
    ['statement', 'delivery_claimed', true],
    ['statement', 'federation_claimed', true],
    ['attestation', 'actor_signature_claimed', true],
    ['attestation', 'authorship_claimed', true],
    ['attestation', 'legal_identity_claimed', true]
  ]) {
    const forged = structuredClone(packageValue);
    forged[target][key] = value;
    assert.throws(
      () => verifySocialExchangePackage(forged, {
        trustedExporterPublicKey: data.exporter.publicKey,
        now: NOW
      }),
      /cannot claim|cannot perform/
    );
  }
});

test('verified package produces only a bounded review-only operator-approval import plan', () => {
  const data = fixture();
  const packageValue = createPackage(data);
  const plan = createSocialExchangeImportPlan(packageValue, {
    trustedExporterPublicKey: data.exporter.publicKey,
    expectedExporterGridId: 'grid-exporter-one',
    recipientPrincipal: 'owner.local-recipient',
    trustLabel: 'manually-reviewed',
    plannedAt: T4,
    expiresAt: T5,
    now: NOW
  });
  assert.equal(plan.schema, SOCIAL_EXCHANGE_IMPORT_PLAN_SCHEMA);
  assert.equal(plan.package_digest, packageValue.package_digest);
  assert.equal(plan.recipient_principal, 'owner.local-recipient');
  assert.equal(plan.requires_operator_approval, true);
  assert.equal(plan.status, 'review-only');
  assert.equal(plan.apply_effect, 'none');
  assert.equal(plan.authority_effect, 'none');
  assert.equal(plan.transport_effect, 'none');
  assert.equal(plan.admitted_objects.persona_projection_digests.length, 1);
  assert.equal(plan.admitted_objects.publication_digests.length, 2);
  assert.equal(plan.admitted_objects.transition_digests.length, 1);
  assert.match(plan.plan_digest, /^[a-f0-9]{64}$/);

  assert.throws(
    () => createSocialExchangeImportPlan(packageValue, {
      trustedExporterPublicKey: data.exporter.publicKey,
      recipientPrincipal: 'owner.local-recipient',
      trustLabel: 'manually-reviewed',
      plannedAt: T4,
      expiresAt: '2026-08-17T18:04:01.000Z',
      now: NOW
    }),
    /lifetime exceeds 24 hours/
  );
  assert.throws(
    () => createSocialExchangeImportPlan(packageValue, {
      trustedExporterPublicKey: data.exporter.publicKey,
      recipientPrincipal: 'owner.local-recipient',
      trustLabel: 'INVALID TRUST LABEL',
      plannedAt: T4,
      expiresAt: T5,
      now: NOW
    }),
    /trust_label has an invalid format/
  );
});
