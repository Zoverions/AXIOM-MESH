import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import { ValidationError, canonicalJson, digestObject } from '../src/lib/canonical.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection
} from '../src/lib/social-publication.mjs';
import {
  createCredentialedPersonaPublicationAttestation,
  createPersonaSigningCredential,
  createPersonaSigningRevocation
} from '../src/lib/persona-journal-credential.mjs';
import {
  PUBLIC_WITNESS_CONFLICT_SCHEMA,
  PUBLIC_WITNESS_OBSERVATION_SCHEMA,
  PUBLIC_WITNESS_SERVICE_SNAPSHOT_SCHEMA,
  createPublicWitnessServiceLab,
  verifyPublicWitnessConflict,
  verifyPublicWitnessObservation
} from '../src/lib/public-witness-service.mjs';

const T0 = '2026-08-17T19:00:00.000Z';
const T1 = '2026-08-17T19:01:00.000Z';
const T2 = '2026-08-17T19:02:00.000Z';
const T3 = '2026-08-17T19:03:00.000Z';
const T4 = '2026-08-17T19:04:00.000Z';
const T5 = '2026-08-17T19:05:00.000Z';
const T6 = '2026-08-17T19:06:00.000Z';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function persona() {
  return {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-witness-lab',
    controller_actor_id: 'actor-private-witness-lab',
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: T0,
    status: 'active'
  };
}

function publication(personaValue, { id, text, createdAt = T1 } = {}) {
  return createSocialPublicationProjection({
    publication_id: id,
    content: { media_type: 'text/plain', text },
    attachment_digests: [],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: createdAt,
    supersedes_digest: null
  }, { persona: personaValue });
}

function fixture() {
  const protectedPersona = persona();
  const projection = createPublicPersonaProjection(protectedPersona);
  const root = keys();
  const journal1 = keys();
  const journal2 = keys();
  const credential1 = createPersonaSigningCredential({
    personaId: projection.persona_id,
    personaProjectionDigest: projection.projection_digest,
    personaRootPrivateKey: root.privateKey,
    signingPublicKey: journal1.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  const credential2 = createPersonaSigningCredential({
    personaId: projection.persona_id,
    personaProjectionDigest: projection.projection_digest,
    personaRootPrivateKey: root.privateKey,
    signingPublicKey: journal2.publicKey,
    epoch: 2,
    activatedAt: T3,
    transitionKind: 'rotation',
    predecessorCredential: credential1,
    predecessorDisposition: 'retired'
  });
  const firstPublication = publication(protectedPersona, {
    id: 'publication-first',
    text: 'Witnesses should preserve evidence without becoming social authorities.',
    createdAt: T1
  });
  const secondPublication = publication(protectedPersona, {
    id: 'publication-second',
    text: 'A conflicting valid artifact is evidence of equivocation, not a vote for a winner.',
    createdAt: T1
  });
  const stalePublication = publication(protectedPersona, {
    id: 'publication-stale',
    text: 'This artifact is signed by an old operational key after a successor became active.',
    createdAt: T4
  });
  const firstAttestation = createCredentialedPersonaPublicationAttestation(firstPublication, {
    personaJournalPrivateKey: journal1.privateKey,
    personaSigningCredential: credential1,
    trustedPersonaRootPublicKey: root.publicKey,
    issuedAt: T1
  });
  const secondAttestation = createCredentialedPersonaPublicationAttestation(secondPublication, {
    personaJournalPrivateKey: journal1.privateKey,
    personaSigningCredential: credential1,
    trustedPersonaRootPublicKey: root.publicKey,
    issuedAt: T1
  });
  const staleAttestation = createCredentialedPersonaPublicationAttestation(stalePublication, {
    personaJournalPrivateKey: journal1.privateKey,
    personaSigningCredential: credential1,
    trustedPersonaRootPublicKey: root.publicKey,
    issuedAt: T4
  });
  return {
    protectedPersona,
    projection,
    root,
    journal1,
    journal2,
    credential1,
    credential2,
    firstPublication,
    secondPublication,
    stalePublication,
    firstAttestation,
    secondAttestation,
    staleAttestation
  };
}

function service(overrides = {}) {
  const witness = keys();
  return {
    witness,
    service: createPublicWitnessServiceLab({
      domainId: 'axiom.social.public.v1',
      witnessId: 'witness-lab-one',
      witnessPrivateKey: witness.privateKey,
      ...overrides
    })
  };
}

test('witness observations are signed, bounded non-authority evidence and exact replays are idempotent', () => {
  const data = fixture();
  const lab = service();
  const first = lab.service.observeCredential(data.credential1, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T1
  });
  assert.equal(first.status, 'observed');
  assert.equal(first.observation.schema, PUBLIC_WITNESS_OBSERVATION_SCHEMA);
  assert.equal(first.observation.statement.cryptographic_verification, true);
  assert.equal(first.observation.statement.legal_identity_claimed, false);
  assert.equal(first.observation.statement.global_currentness_claimed, false);
  assert.equal(first.observation.statement.finality_claimed, false);
  assert.equal(first.observation.statement.authority_effect, 'none');
  assert.equal(first.observation.statement.network_effect, 'none');

  const verified = verifyPublicWitnessObservation(first.observation, {
    trustedWitnessPublicKey: lab.service.witnessPublicKey,
    expectedDomainId: 'axiom.social.public.v1'
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.witness_signature_valid, true);

  const replay = lab.service.observeCredential(data.credential1, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T5
  });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.observation.observation_digest, first.observation.observation_digest);
  assert.equal(lab.service.snapshot().artifact_count, 1);

  const snapshot = lab.service.snapshot();
  assert.equal(snapshot.schema, PUBLIC_WITNESS_SERVICE_SNAPSHOT_SCHEMA);
  assert.equal(snapshot.global_currentness_claimed, false);
  assert.equal(snapshot.finality_claimed, false);
  assert.equal(snapshot.authority_effect, 'none');
  assert.equal(snapshot.network_effect, 'none');
});

test('two root-valid signing credentials at the same epoch are preserved as credential equivocation', () => {
  const data = fixture();
  const alternateJournal = keys();
  const alternateCredential = createPersonaSigningCredential({
    personaId: data.projection.persona_id,
    personaProjectionDigest: data.projection.projection_digest,
    personaRootPrivateKey: data.root.privateKey,
    signingPublicKey: alternateJournal.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  const lab = service();
  const first = lab.service.observeCredential(data.credential1, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T1
  });
  const second = lab.service.observeCredential(alternateCredential, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T2
  });
  assert.equal(second.status, 'observed-with-conflict');
  assert.equal(second.conflicts.length, 1);
  const conflict = second.conflicts[0];
  assert.equal(conflict.schema, PUBLIC_WITNESS_CONFLICT_SCHEMA);
  assert.equal(conflict.statement.conflict_kind, 'credential-epoch');
  assert.equal(conflict.statement.preferred_artifact_digest, null);
  assert.equal(conflict.statement.truth_resolution_claimed, false);
  assert.equal(conflict.statement.authority_effect, 'none');

  const position = lab.service.listPosition({
    positionKind: 'credential-epoch',
    personaId: data.projection.persona_id,
    personaProjectionDigest: data.projection.projection_digest,
    personaRootKeyId: data.credential1.statement.root_key_id,
    position: 1
  });
  assert.equal(position.length, 2);
  assert.deepEqual(
    position.map(item => item.statement.artifact_digest).sort(),
    [data.credential1.credential_digest, alternateCredential.credential_digest].sort()
  );

  const checked = verifyPublicWitnessConflict(conflict, {
    trustedWitnessPublicKey: lab.service.witnessPublicKey,
    observations: [first.observation, second.observation]
  });
  assert.equal(checked.valid, true);
});

test('two valid journal artifacts at the same public sequence are retained as journal equivocation', () => {
  const data = fixture();
  const lab = service();
  lab.service.observeCredential(data.credential1, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T1
  });
  const first = lab.service.observeJournal(data.firstAttestation, {
    personaSigningCredential: data.credential1,
    trustedPersonaRootPublicKey: data.root.publicKey,
    entry: data.firstPublication,
    observedAt: T2
  });
  const second = lab.service.observeJournal(data.secondAttestation, {
    personaSigningCredential: data.credential1,
    trustedPersonaRootPublicKey: data.root.publicKey,
    entry: data.secondPublication,
    observedAt: T3
  });
  assert.equal(first.observation.statement.position, 1);
  assert.equal(second.status, 'observed-with-conflict');
  assert.equal(second.conflicts.some(item => item.statement.conflict_kind === 'journal-sequence'), true);
  const position = lab.service.listPosition({
    positionKind: 'journal-sequence',
    personaId: data.projection.persona_id,
    personaProjectionDigest: data.projection.projection_digest,
    personaRootKeyId: data.credential1.statement.root_key_id,
    position: 1
  });
  assert.equal(position.length, 2);
  assert.equal(lab.service.getArtifact(data.firstAttestation.attestation_digest).attestation_digest, data.firstAttestation.attestation_digest);
  assert.equal(lab.service.getArtifact(data.secondAttestation.attestation_digest).attestation_digest, data.secondAttestation.attestation_digest);
});

test('late successor evidence preserves an already observed stale-key journal and adds explicit stale-key-use evidence', () => {
  const data = fixture();
  const lab = service();
  lab.service.observeCredential(data.credential1, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T1
  });
  const stale = lab.service.observeJournal(data.staleAttestation, {
    personaSigningCredential: data.credential1,
    trustedPersonaRootPublicKey: data.root.publicKey,
    entry: data.stalePublication,
    observedAt: T4
  });
  assert.equal(stale.status, 'observed');
  assert.equal(stale.observation.statement.key_state_status, 'no-contradiction-observed');

  const successor = lab.service.observeCredential(data.credential2, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T5
  });
  assert.equal(successor.status, 'observed-with-conflict');
  const staleConflict = successor.conflicts.find(item => item.statement.conflict_kind === 'stale-key-use');
  assert.ok(staleConflict);
  assert.deepEqual(
    staleConflict.statement.artifact_digests,
    [data.staleAttestation.attestation_digest, data.credential2.credential_digest].sort()
  );
  assert.equal(lab.service.getArtifact(data.staleAttestation.attestation_digest).attestation_digest, data.staleAttestation.attestation_digest);

  const replay = lab.service.observeJournal(data.staleAttestation, {
    personaSigningCredential: data.credential1,
    trustedPersonaRootPublicKey: data.root.publicKey,
    entry: data.stalePublication,
    observedAt: T6
  });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.conflicts.some(item => item.statement.conflict_kind === 'stale-key-use'), true);
});

test('known successor or revocation evidence marks a stale journal as contradicted without discarding it', () => {
  const data = fixture();
  const lab = service();
  lab.service.observeCredential(data.credential1, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T1
  });
  lab.service.observeCredential(data.credential2, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T3
  });
  const stale = lab.service.observeJournal(data.staleAttestation, {
    personaSigningCredential: data.credential1,
    trustedPersonaRootPublicKey: data.root.publicKey,
    entry: data.stalePublication,
    observedAt: T5
  });
  assert.equal(stale.status, 'observed-with-conflict');
  assert.equal(stale.observation.statement.key_state_status, 'contradicted');
  assert.deepEqual(stale.observation.statement.key_state_evidence_digests, [data.credential2.credential_digest]);
  assert.equal(stale.conflicts.some(item => item.statement.conflict_kind === 'stale-key-use'), true);

  const secondLab = service();
  const revocation = createPersonaSigningRevocation(data.credential1, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    personaRootPrivateKey: data.root.privateKey,
    effectiveAt: T2,
    reasonCode: 'suspected-compromise'
  });
  secondLab.service.observeCredential(data.credential1, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T1
  });
  secondLab.service.observeRevocation(revocation, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    credential: data.credential1,
    observedAt: T2
  });
  const revokedUse = secondLab.service.observeJournal(data.staleAttestation, {
    personaSigningCredential: data.credential1,
    trustedPersonaRootPublicKey: data.root.publicKey,
    entry: data.stalePublication,
    observedAt: T5
  });
  assert.equal(revokedUse.observation.statement.key_state_status, 'contradicted');
  assert.deepEqual(revokedUse.observation.statement.key_state_evidence_digests, [revocation.revocation_digest]);
});

test('capacity exhaustion is fail-closed and does not partially commit conflict-producing artifacts', () => {
  const data = fixture();
  const alternateA = keys();
  const alternateB = keys();
  const credentialA = createPersonaSigningCredential({
    personaId: data.projection.persona_id,
    personaProjectionDigest: data.projection.projection_digest,
    personaRootPrivateKey: data.root.privateKey,
    signingPublicKey: alternateA.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  const credentialB = createPersonaSigningCredential({
    personaId: data.projection.persona_id,
    personaProjectionDigest: data.projection.projection_digest,
    personaRootPrivateKey: data.root.privateKey,
    signingPublicKey: alternateB.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  const lab = service({ maxConflicts: 1 });
  lab.service.observeCredential(data.credential1, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T1
  });
  lab.service.observeCredential(credentialA, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T2
  });
  assert.equal(lab.service.snapshot().artifact_count, 2);
  assert.equal(lab.service.snapshot().conflict_count, 1);
  assert.throws(
    () => lab.service.observeCredential(credentialB, {
      trustedPersonaRootPublicKey: data.root.publicKey,
      observedAt: T3
    }),
    /conflict capacity is exhausted/
  );
  assert.equal(lab.service.snapshot().artifact_count, 2);
  assert.equal(lab.service.getArtifact(credentialB.credential_digest), null);
});

test('witness observation and conflict tampering fail verification', () => {
  const data = fixture();
  const alternate = keys();
  const alternateCredential = createPersonaSigningCredential({
    personaId: data.projection.persona_id,
    personaProjectionDigest: data.projection.projection_digest,
    personaRootPrivateKey: data.root.privateKey,
    signingPublicKey: alternate.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  const lab = service();
  lab.service.observeCredential(data.credential1, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T1
  });
  const second = lab.service.observeCredential(alternateCredential, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T2
  });
  const tamperedObservation = structuredClone(second.observation);
  tamperedObservation.statement.global_currentness_claimed = true;
  assert.throws(
    () => verifyPublicWitnessObservation(tamperedObservation, {
      trustedWitnessPublicKey: lab.service.witnessPublicKey
    }),
    /cannot claim truth, authorship, legal identity, global currentness, or finality|statement digest/
  );
  const tamperedConflict = structuredClone(second.conflicts[0]);
  tamperedConflict.statement.preferred_artifact_digest = data.credential1.credential_digest;
  assert.throws(
    () => verifyPublicWitnessConflict(tamperedConflict, {
      trustedWitnessPublicKey: lab.service.witnessPublicKey
    }),
    /without selecting a preferred artifact|statement digest/
  );
});

// --- P5 family: verifyPublicWitnessObservation reads only one plain-data copy ---

// Re-signs a statement with the witness key exactly as signEnvelope does, so the
// only thing wrong with the result is the statement content itself.
function witnessSigned(envelope, statement, witnessPrivateKey, digestField = 'observation_digest') {
  const statementDigest = digestObject(statement);
  const signable = { schema: envelope.schema, statement, statement_digest: statementDigest };
  const witnessSignature = sign(null, Buffer.from(canonicalJson(signable)), witnessPrivateKey).toString('base64url');
  const signed = { ...signable, witness_signature: witnessSignature };
  return { ...signed, [digestField]: digestObject(signed) };
}

function observedCredential() {
  const data = fixture();
  const lab = service();
  const first = lab.service.observeCredential(data.credential1, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T1
  });
  return { data, lab, observation: structuredClone(first.observation) };
}

const isWitnessPlainDataRejection = error => error instanceof ValidationError
  && /public witness observation must be plain data/.test(error.message);

test('P5 witness: a getter cannot show the checked artifact_schema to the checks and a different signed one to the output', () => {
  const { lab, observation } = observedCredential();
  const options = { trustedWitnessPublicKey: lab.service.witnessPublicKey };
  const genuineSchema = observation.statement.artifact_schema;
  // A statement the witness key signed, but whose schema is inconsistent with its kind.
  const inconsistent = witnessSigned(observation, { ...observation.statement, artifact_schema: 'axiom-unrelated.v1' }, lab.witness.privateKey);
  assert.throws(() => verifyPublicWitnessObservation(inconsistent, options), /credential observation schema is invalid/);
  let reads = 0;
  const statement = { ...inconsistent.statement };
  Object.defineProperty(statement, 'artifact_schema', {
    enumerable: true,
    get() { reads += 1; return reads === 1 ? genuineSchema : 'axiom-unrelated.v1'; }
  });
  let result;
  assert.throws(() => { result = verifyPublicWitnessObservation({ ...inconsistent, statement }, options); }, isWitnessPlainDataRejection);
  assert.equal(result, undefined);
  assert.equal(reads, 0);
  let traps = 0;
  const proxied = new Proxy(inconsistent.statement, {
    get(target, property, receiver) {
      traps += 1;
      return property === 'artifact_schema' && traps === 1 ? genuineSchema : Reflect.get(target, property, receiver);
    }
  });
  assert.throws(() => verifyPublicWitnessObservation({ ...inconsistent, statement: proxied }, options), isWitnessPlainDataRejection);
  assert.equal(traps, 0);
});

test('P5 witness: counting sweep - a getter at every observation slot is rejected with zero caller reads', () => {
  const { lab, observation } = observedCredential();
  const options = { trustedWitnessPublicKey: lab.service.witnessPublicKey };
  const slots = [];
  const walk = (value, path) => {
    if (value === null || typeof value !== 'object') return;
    for (const key of Object.keys(value)) { slots.push([path, key]); walk(value[key], [...path, key]); }
  };
  walk(observation, []);
  assert.ok(slots.length > 25, `sweep covers every slot (${slots.length})`);
  let reads = 0;
  for (const [path, key] of slots) {
    const copy = structuredClone(observation);
    const container = path.reduce((node, part) => node[part], copy);
    const original = container[key];
    Object.defineProperty(container, key, { enumerable: true, get() { reads += 1; return original; } });
    assert.throws(() => verifyPublicWitnessObservation(copy, options), isWitnessPlainDataRejection, [...path, key].join('.'));
  }
  assert.equal(reads, 0);
});

test('P5 witness controls: plain, JSON, structuredClone, null-prototype and frozen observations verify identically', () => {
  const { lab, observation } = observedCredential();
  const options = { trustedWitnessPublicKey: lab.service.witnessPublicKey, expectedDomainId: 'axiom.social.public.v1' };
  const expected = verifyPublicWitnessObservation(observation, options);
  const nullPrototype = value => {
    if (Array.isArray(value)) return value.map(nullPrototype);
    if (value === null || typeof value !== 'object') return value;
    return Object.assign(Object.create(null), Object.fromEntries(Object.entries(value).map(([k, v]) => [k, nullPrototype(v)])));
  };
  for (const [name, input] of Object.entries({
    json: JSON.parse(JSON.stringify(observation)),
    structuredClone: structuredClone(observation),
    nullPrototype: nullPrototype(observation),
    frozen: Object.freeze(structuredClone(observation))
  })) {
    assert.deepEqual(verifyPublicWitnessObservation(input, options), expected, name);
  }
});

test('witness fail-closed controls: missing, mismatched or wrong-domain witness and tampered signatures stay rejected', () => {
  const { lab, observation } = observedCredential();
  const other = service();
  assert.throws(() => verifyPublicWitnessObservation(observation, {}), /trusted public witness observation public key is invalid/);
  assert.throws(() => verifyPublicWitnessObservation(observation, { trustedWitnessPublicKey: other.service.witnessPublicKey }),
    /witness key does not match the trusted public key/);
  assert.throws(() => verifyPublicWitnessObservation(observation, {
    trustedWitnessPublicKey: lab.service.witnessPublicKey, expectedDomainId: 'axiom.other.v1'
  }), /belongs to a different domain/);
  // Re-signed by a different key under the original witness_key_id.
  const forged = witnessSigned(observation, observation.statement, other.witness.privateKey);
  assert.throws(() => verifyPublicWitnessObservation(forged, { trustedWitnessPublicKey: lab.service.witnessPublicKey }),
    /witness signature is invalid/);
  const wrongDigest = { ...structuredClone(observation), observation_digest: 'f'.repeat(64) };
  assert.throws(() => verifyPublicWitnessObservation(wrongDigest, { trustedWitnessPublicKey: lab.service.witnessPublicKey }),
    /observation_digest does not match/);
});

// --- B-1: verifyPublicWitnessConflict reads only one plain-data copy ---

function observedConflict() {
  const data = fixture();
  const alternateJournal = keys();
  const alternateCredential = createPersonaSigningCredential({
    personaId: data.projection.persona_id,
    personaProjectionDigest: data.projection.projection_digest,
    personaRootPrivateKey: data.root.privateKey,
    signingPublicKey: alternateJournal.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  const lab = service();
  const first = lab.service.observeCredential(data.credential1, { trustedPersonaRootPublicKey: data.root.publicKey, observedAt: T1 });
  const second = lab.service.observeCredential(alternateCredential, { trustedPersonaRootPublicKey: data.root.publicKey, observedAt: T2 });
  return {
    lab,
    conflict: structuredClone(second.conflicts[0]),
    observations: [structuredClone(first.observation), structuredClone(second.observation)]
  };
}

const isConflictPlainDataRejection = error => error instanceof ValidationError
  && /public witness conflict must be plain data/.test(error.message);

test('B-1: a Proxy artifact_digests reporting length 2, 2, then 3 cannot pass the exactly-two bound', () => {
  const { lab, conflict } = observedConflict();
  const options = { trustedWitnessPublicKey: lab.service.witnessPublicKey };
  // The witness key signs a conflict with three artifact digests; the schema requires exactly two.
  const three = [...conflict.statement.artifact_digests, 'e'.repeat(64)].sort();
  const signed = witnessSigned(conflict, { ...conflict.statement, artifact_digests: three }, lab.witness.privateKey, 'conflict_digest');
  assert.throws(() => verifyPublicWitnessConflict(signed, options), /artifact_digests must contain 2-2 digests/);
  let lengthReads = 0;
  let traps = 0;
  const lying = new Proxy([...three], {
    get(target, property, receiver) {
      traps += 1;
      if (property === 'length') { lengthReads += 1; return lengthReads <= 2 ? 2 : 3; }
      return Reflect.get(target, property, receiver);
    },
    has(target, property) { traps += 1; return Reflect.has(target, property); },
    ownKeys(target) { traps += 1; return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, property) { traps += 1; return Reflect.getOwnPropertyDescriptor(target, property); }
  });
  let result;
  assert.throws(() => {
    result = verifyPublicWitnessConflict({ ...signed, statement: { ...signed.statement, artifact_digests: lying } }, options);
  }, isConflictPlainDataRejection);
  assert.equal(result, undefined);
  assert.equal(lengthReads, 0);
  assert.equal(traps, 0);
});

test('B-1: counting sweep - a getter at every conflict slot is rejected with zero caller reads', () => {
  const { lab, conflict } = observedConflict();
  const options = { trustedWitnessPublicKey: lab.service.witnessPublicKey };
  const slots = [];
  const walk = (value, path) => {
    if (value === null || typeof value !== 'object') return;
    for (const key of Object.keys(value)) { slots.push([path, key]); walk(value[key], [...path, key]); }
  };
  walk(conflict, []);
  assert.ok(slots.length > 20, `sweep covers every slot (${slots.length})`);
  let reads = 0;
  for (const [path, key] of slots) {
    const copy = structuredClone(conflict);
    const container = path.reduce((node, part) => node[part], copy);
    const original = container[key];
    Object.defineProperty(container, key, { enumerable: true, get() { reads += 1; return original; } });
    assert.throws(() => verifyPublicWitnessConflict(copy, options), isConflictPlainDataRejection, [...path, key].join('.'));
  }
  assert.equal(reads, 0);
});

test('B-1 controls: plain, JSON, structuredClone, null-prototype and frozen conflicts verify identically', () => {
  const { lab, conflict, observations } = observedConflict();
  const options = { trustedWitnessPublicKey: lab.service.witnessPublicKey, observations };
  const expected = verifyPublicWitnessConflict(conflict, options);
  assert.equal(expected.valid, true);
  const nullPrototype = value => {
    if (Array.isArray(value)) return value.map(nullPrototype);
    if (value === null || typeof value !== 'object') return value;
    return Object.assign(Object.create(null), Object.fromEntries(Object.entries(value).map(([k, v]) => [k, nullPrototype(v)])));
  };
  for (const [name, input] of Object.entries({
    json: JSON.parse(JSON.stringify(conflict)),
    structuredClone: structuredClone(conflict),
    nullPrototype: nullPrototype(conflict),
    frozen: Object.freeze(structuredClone(conflict))
  })) {
    assert.deepEqual(verifyPublicWitnessConflict(input, options), expected, name);
  }
});
