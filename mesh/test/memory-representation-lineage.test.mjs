import assert from 'node:assert/strict';
import test from 'node:test';

async function loadSubject() {
  try {
    return await import('../src/lib/memory-representation-lineage.mjs');
  } catch {
    return null;
  }
}

async function subject() {
  const loaded = await loadSubject();
  assert.ok(loaded, 'memory representation lineage module must exist');
  return loaded;
}

function recoverability(overrides = {}) {
  return {
    byte: true,
    semantic: true,
    provenance: true,
    relationship: true,
    operational: true,
    identity: true,
    ...overrides,
  };
}

function entity(overrides = {}) {
  return {
    schema: 'axiom-memory-entity.v0',
    version: 0,
    status: 'inert-lineage-contract',
    memory_id: 'memory.entity.preference.communication',
    owner: 'human:owner',
    provenance_refs: ['event:conversation:1'],
    representation_refs: ['repr:text:1', 'repr:image-compaction:1'],
    created_at: '2026-09-18T14:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    ...overrides,
  };
}

function representation(overrides = {}) {
  return {
    schema: 'axiom-memory-representation.v0',
    version: 0,
    status: 'inert-lineage-contract',
    representation_id: 'repr:text:1',
    memory_id: 'memory.entity.preference.communication',
    owner: 'human:owner',
    format: 'text.utf8',
    content_digest: 'a'.repeat(64),
    derived_from: [],
    fidelity: 'exact',
    recoverability: recoverability(),
    created_by: 'human:owner',
    created_at: '2026-09-18T14:00:00.000Z',
    retention_class: 'durable-source',
    authoritative_for: ['history', 'recovery'],
    promotion_receipt_ref: null,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    ...overrides,
  };
}

function transition(overrides = {}) {
  return {
    schema: 'axiom-memory-transition.v0',
    version: 0,
    status: 'inert-lineage-contract',
    transition_id: 'transition:compress:1',
    memory_id: 'memory.entity.preference.communication',
    owner: 'human:owner',
    operation: 'compress',
    source_representation_ids: ['repr:text:1'],
    destination_representation_ids: ['repr:image-compaction:1'],
    actor: 'agent:local-maintainer',
    purpose: 'Reduce active model-context cost while retaining the source',
    fidelity: 'lossy-source-retained',
    source_retained: true,
    information_discarded: 'surface formatting and tokenization details',
    recoverability_before: recoverability(),
    recoverability_after: recoverability(),
    promotion_scopes: [],
    occurred_at: '2026-09-18T14:01:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    ...overrides,
  };
}

test('memory entity permits multiple representations without a canonical representation field', async () => {
  const { validateMemoryEntity } = await subject();
  const document = entity();

  const first = validateMemoryEntity(document);
  const second = validateMemoryEntity(structuredClone(document));

  assert.equal(first.valid, true);
  assert.equal(first.schema, 'axiom-memory-entity.v0');
  assert.match(first.document_digest, /^[a-f0-9]{64}$/);
  assert.equal(first.document_digest, second.document_digest);
  assert.equal(Object.hasOwn(document, 'canonical_representation_id'), false);
});

test('memory entity rejects duplicate references and an invented canonical field', async () => {
  const { validateMemoryEntity } = await subject();

  assert.throws(
    () => validateMemoryEntity(entity({ provenance_refs: ['event:1', 'event:1'] })),
    /duplicate/,
  );
  assert.throws(
    () => validateMemoryEntity(entity({ representation_refs: ['repr:text:1', 'repr:text:1'] })),
    /duplicate/,
  );
  assert.throws(
    () => validateMemoryEntity({ ...entity(), canonical_representation_id: 'repr:text:1' }),
    /unknown field/,
  );
});

test('memory entity safety boundary is fixed to inert behavior', async () => {
  const { validateMemoryEntity } = await subject();

  assert.throws(
    () => validateMemoryEntity(entity({ authority_effect: 'grant' })),
    /safety boundary/,
  );
  assert.throws(
    () => validateMemoryEntity(entity({ network_effect: 'egress' })),
    /safety boundary/,
  );
  assert.throws(
    () => validateMemoryEntity(entity({ runtime_activation: true })),
    /safety boundary/,
  );
});

test('source representation may be purpose-authoritative without a promotion receipt', async () => {
  const { validateMemoryRepresentation } = await subject();
  const result = validateMemoryRepresentation(representation());

  assert.equal(result.valid, true);
  assert.match(result.document_digest, /^[a-f0-9]{64}$/);
});

test('derived open-ended representation remains non-authoritative until explicitly promoted', async () => {
  const { validateMemoryRepresentation } = await subject();
  const document = representation({
    representation_id: 'repr:image-compaction:1',
    format: 'image.microfont-context',
    content_digest: 'b'.repeat(64),
    derived_from: ['repr:text:1'],
    fidelity: 'lossy-source-retained',
    recoverability: recoverability({ byte: false }),
    retention_class: 'regenerable-context',
    authoritative_for: [],
  });

  assert.equal(validateMemoryRepresentation(document).valid, true);

  assert.throws(
    () => validateMemoryRepresentation({
      ...document,
      authoritative_for: ['model-context'],
      promotion_receipt_ref: null,
    }),
    /promotion receipt/,
  );

  assert.equal(validateMemoryRepresentation({
    ...document,
    authoritative_for: ['model-context'],
    promotion_receipt_ref: 'transition:promote:1',
  }).valid, true);
});

test('representation validator rejects duplicate parents, invalid digests, fidelity drift, and unknown fields', async () => {
  const { validateMemoryRepresentation } = await subject();

  assert.throws(
    () => validateMemoryRepresentation(representation({
      derived_from: ['repr:source:1', 'repr:source:1'],
      authoritative_for: [],
    })),
    /duplicate/,
  );
  assert.throws(
    () => validateMemoryRepresentation(representation({ content_digest: 'not-a-digest' })),
    /content_digest/,
  );
  assert.throws(
    () => validateMemoryRepresentation(representation({ fidelity: 'perfect-enough' })),
    /fidelity/,
  );
  assert.throws(
    () => validateMemoryRepresentation({ ...representation(), canonical: true }),
    /unknown field/,
  );
});

test('representation safety boundary is fixed to inert behavior', async () => {
  const { validateMemoryRepresentation } = await subject();

  assert.throws(
    () => validateMemoryRepresentation(representation({ authority_effect: 'inherit-source' })),
    /safety boundary/,
  );
  assert.throws(
    () => validateMemoryRepresentation(representation({ network_effect: 'publish' })),
    /safety boundary/,
  );
  assert.throws(
    () => validateMemoryRepresentation(representation({ runtime_activation: true })),
    /safety boundary/,
  );
});

test('ordinary representation transition preserves explicit lineage and deterministic digest', async () => {
  const { validateMemoryTransition } = await subject();
  const document = transition();

  const first = validateMemoryTransition(document);
  const second = validateMemoryTransition(structuredClone(document));

  assert.equal(first.valid, true);
  assert.equal(first.document_digest, second.document_digest);
  assert.match(first.document_digest, /^[a-f0-9]{64}$/);
});

test('transition rejects source-destination overlap and invalid cardinality', async () => {
  const { validateMemoryTransition } = await subject();

  assert.throws(
    () => validateMemoryTransition(transition({
      destination_representation_ids: ['repr:text:1'],
    })),
    /source and destination/,
  );

  assert.throws(
    () => validateMemoryTransition(transition({
      operation: 'observe',
      source_representation_ids: ['repr:text:1'],
    })),
    /observe/,
  );
  assert.throws(
    () => validateMemoryTransition(transition({
      operation: 'observe',
      source_representation_ids: [],
      destination_representation_ids: [],
    })),
    /observe/,
  );
  assert.throws(
    () => validateMemoryTransition(transition({
      source_representation_ids: [],
    })),
    /requires at least one source/,
  );
  assert.throws(
    () => validateMemoryTransition(transition({
      destination_representation_ids: [],
    })),
    /requires at least one destination/,
  );
});

test('observe transition accepts source-free creation of a first representation', async () => {
  const { validateMemoryTransition } = await subject();

  assert.equal(validateMemoryTransition(transition({
    transition_id: 'transition:observe:1',
    operation: 'observe',
    source_representation_ids: [],
    destination_representation_ids: ['repr:text:1'],
    fidelity: 'exact',
    source_retained: false,
    information_discarded: null,
  })).valid, true);
});

test('promotion requires explicit scopes and non-promotion cannot carry them', async () => {
  const { validateMemoryTransition } = await subject();

  assert.throws(
    () => validateMemoryTransition(transition({
      transition_id: 'transition:promote:1',
      operation: 'promote',
      promotion_scopes: [],
    })),
    /promotion scopes/,
  );

  assert.equal(validateMemoryTransition(transition({
    transition_id: 'transition:promote:1',
    operation: 'promote',
    promotion_scopes: ['model-context'],
  })).valid, true);

  assert.throws(
    () => validateMemoryTransition(transition({ promotion_scopes: ['history'] })),
    /only promote/,
  );
});

test('forget transition makes irreversible loss explicit', async () => {
  const { validateMemoryTransition } = await subject();

  const validForget = transition({
    transition_id: 'transition:forget:1',
    operation: 'forget',
    destination_representation_ids: [],
    fidelity: 'not-applicable',
    source_retained: false,
    information_discarded: 'the source representation and its byte-recovery guarantee',
    recoverability_after: recoverability({
      byte: false,
      semantic: false,
      operational: false,
    }),
  });

  assert.equal(validateMemoryTransition(validForget).valid, true);

  assert.throws(
    () => validateMemoryTransition({
      ...validForget,
      source_representation_ids: [],
    }),
    /forget/,
  );
  assert.throws(
    () => validateMemoryTransition({
      ...validForget,
      fidelity: 'lossy-terminal',
    }),
    /not-applicable/,
  );
  assert.throws(
    () => validateMemoryTransition({
      ...validForget,
      information_discarded: null,
    }),
    /discarded/,
  );
});

test('terminal loss cannot conceal discarded information or claim byte recovery', async () => {
  const { validateMemoryTransition } = await subject();
  const terminal = transition({
    transition_id: 'transition:redact:1',
    operation: 'redact',
    fidelity: 'lossy-terminal',
    source_retained: false,
    recoverability_after: recoverability({ byte: false }),
  });

  assert.equal(validateMemoryTransition(terminal).valid, true);

  assert.throws(
    () => validateMemoryTransition({ ...terminal, information_discarded: ' ' }),
    /discarded/,
  );
  assert.throws(
    () => validateMemoryTransition({
      ...terminal,
      recoverability_after: recoverability({ byte: true }),
    }),
    /byte recoverability/,
  );
});

test('transition safety boundary and exact shape fail closed', async () => {
  const { validateMemoryTransition } = await subject();

  assert.throws(
    () => validateMemoryTransition(transition({ authority_effect: 'grant' })),
    /safety boundary/,
  );
  assert.throws(
    () => validateMemoryTransition(transition({ network_effect: 'send' })),
    /safety boundary/,
  );
  assert.throws(
    () => validateMemoryTransition(transition({ runtime_activation: true })),
    /safety boundary/,
  );
  assert.throws(
    () => validateMemoryTransition({ ...transition(), inferred_authority: true }),
    /unknown field/,
  );
});
