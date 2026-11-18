import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOCIAL_WRITE_ACTIONS,
  WRITE_CONTROLS_SCHEMA,
  socialWriteExplanation,
  createWriteControlStore,
  freezeRequest,
  requestAuthorization,
  issueRetractionIntent,
  confirmRetractionIntent,
  executeWrite,
  retryWrite,
  auditTrail,
  lintPrincipalRef,
} from './social-write-controls.mjs';

const PRINCIPAL = 'personal.local';
const SCOPES = ['social:write'];

function storeAt(fixedNow = 1_000_000) {
  return createWriteControlStore({ now: () => fixedNow });
}

function frozenPersona(store) {
  return freezeRequest(store, {
    principalRef: PRINCIPAL,
    action: 'social.persona.create',
    request: { display_name: 'Reviewer', visibility: 'local' },
  });
}

describe('review-only social write controls', () => {
  it('exposes exactly the five owner-local Social write actions', () => {
    assert.deepEqual(Object.keys(SOCIAL_WRITE_ACTIONS).sort(), [
      'social.actor.create',
      'social.persona.create',
      'social.publication.create',
      'social.publication.retract',
      'social.publication.supersede',
    ]);
    for (const action of Object.keys(SOCIAL_WRITE_ACTIONS)) {
      assert.equal(SOCIAL_WRITE_ACTIONS[action].external_egress, false);
      assert.equal(SOCIAL_WRITE_ACTIONS[action].scope, 'social:write');
      assert.match(socialWriteExplanation(action).preview_state, /Review-only/);
    }
  });

  it('freezes requests deterministically without storing request payloads in facts', () => {
    const store = storeAt();
    const a = freezeRequest(store, {
      principalRef: PRINCIPAL,
      action: 'social.persona.create',
      request: { b: 2, a: 1 },
    });
    const b = freezeRequest(store, {
      principalRef: PRINCIPAL,
      action: 'social.persona.create',
      request: { a: 1, b: 2 },
    });
    assert.equal(a.frozen.digest, b.frozen.digest);
    assert.equal(a.frozen.schema, WRITE_CONTROLS_SCHEMA);
    assert.doesNotMatch(JSON.stringify(auditTrail(store)), /display_name|Reviewer/);
  });

  it('rejects unknown actions and real-world identifiers at the review boundary', () => {
    const store = storeAt();
    assert.throws(() => freezeRequest(store, {
      principalRef: PRINCIPAL,
      action: 'social.remote.blast',
      request: {},
    }), /unknown social write action/);
    assert.throws(() => lintPrincipalRef('tyler@example.com'), /identifier/);
  });

  it('does not mint authority from caller-supplied social:write scope', () => {
    const store = storeAt();
    const { frozen } = frozenPersona(store);
    const outcome = requestAuthorization(store, {
      principalRef: PRINCIPAL,
      scopes: SCOPES,
      action: frozen.action,
      frozenDigest: frozen.digest,
    });
    assert.deepEqual(outcome, { granted: false, reason: 'kernel_authority_required' });
    assert.equal(auditTrail(store).at(-1).event, 'write.authorization.denied');
  });

  it('keeps retraction confirmation review-only and cannot turn it into authority', () => {
    const store = storeAt();
    const { frozen } = freezeRequest(store, {
      principalRef: PRINCIPAL,
      action: 'social.publication.retract',
      request: { publication: 'pub-1' },
    });
    assert.equal(issueRetractionIntent(store, {
      principalRef: PRINCIPAL,
      scopes: SCOPES,
      frozenDigest: frozen.digest,
    }).reason, 'kernel_authority_required');
    assert.equal(confirmRetractionIntent(store, {
      principalRef: PRINCIPAL,
      intentId: 'forged-local-intent',
      confirmation: 'confirm:social.publication.retract',
    }).reason, 'kernel_authority_required');
  });

  it('FORGED SCOPE + SUPPLIED ADAPTER: never produces an effect', () => {
    const store = storeAt();
    const { frozen, canonical } = frozenPersona(store);
    const forged = requestAuthorization(store, {
      principalRef: PRINCIPAL,
      scopes: SCOPES,
      action: frozen.action,
      frozenDigest: frozen.digest,
    });
    let adapterCalls = 0;
    const outcome = executeWrite(store, {
      principalRef: PRINCIPAL,
      frozen,
      canonical,
      authorization: forged.authorization,
      adapter: () => { adapterCalls += 1; return { ok: true }; },
    });
    assert.equal(outcome.executed, false);
    assert.equal(outcome.reason, 'kernel_authority_required');
    assert.equal(adapterCalls, 0);
    assert.equal(auditTrail(store).filter(f => f.event === 'write.executed').length, 0);
  });

  it('still fails closed on digest or principal mismatch before authority routing', () => {
    const store = storeAt();
    const { frozen, canonical } = frozenPersona(store);
    assert.equal(executeWrite(store, {
      principalRef: PRINCIPAL,
      frozen,
      canonical: canonical.replace('Reviewer', 'Attacker'),
      adapter: () => { throw new Error('must not run'); },
    }).reason, 'frozen_digest_mismatch');
    assert.equal(executeWrite(store, {
      principalRef: 'personal.other',
      frozen,
      canonical,
      adapter: () => { throw new Error('must not run'); },
    }).reason, 'principal_mismatch');
  });

  it('retry cannot invent a completed browser-local write', () => {
    const store = storeAt();
    const { frozen } = frozenPersona(store);
    let adapterCalls = 0;
    const outcome = retryWrite(store, {
      principalRef: PRINCIPAL,
      frozen,
      adapter: () => { adapterCalls += 1; },
    });
    assert.deepEqual(outcome, { retried: false, reason: 'no_completed_write' });
    assert.equal(adapterCalls, 0);
  });

  it('keeps the audit trail facts-only and ordered', () => {
    const store = storeAt();
    frozenPersona(store);
    requestAuthorization(store, {
      principalRef: PRINCIPAL,
      scopes: SCOPES,
      action: 'social.persona.create',
      frozenDigest: '0'.repeat(64),
    });
    const trail = auditTrail(store);
    trail.forEach((record, index) => {
      assert.equal(record.seq, index);
      assert.equal(typeof record.ts, 'number');
    });
    assert.doesNotMatch(JSON.stringify(trail), /display_name|Reviewer/);
  });
});
