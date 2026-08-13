import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DELEGATED_AUTHORIZATION_RESOLVE_ROUTE,
  createDelegatedAuthorizationResolveHandler,
  registerDelegatedAuthorizationGridRoute,
} from '../src/grid/delegated-authorization-route.mjs';

function request(overrides = {}) {
  return {
    consent_id: 'delegated_consent_1',
    subject_id: 'learner.child.1',
    holder_id: 'adult.guardian.1',
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    action: 'education.learner.event.append',
    data_scopes: ['learning-progress:write'],
    ...overrides,
  };
}

function body(value = request()) {
  return Buffer.from(JSON.stringify(value));
}

test('delegated authorization route registers one exact Hypervisor-to-Grid POST boundary', () => {
  let registration;
  const router = {
    add(method, path, handler) {
      registration = { method, path, handler };
    },
  };
  const store = {
    resolveDelegatedConsentAuthorization() {
      return { allow: true };
    },
  };

  registerDelegatedAuthorizationGridRoute(router, store);
  assert.equal(registration.method, 'POST');
  assert.equal(registration.path, DELEGATED_AUTHORIZATION_RESOLVE_ROUTE);
  assert.equal(typeof registration.handler, 'function');
});

test('delegated authorization route forwards only the exact normalized authority request', async () => {
  let observed;
  const expected = Object.freeze({
    allow: true,
    facts: Object.freeze({ schema: 'axiom-human-delegated-consent-facts.v1' }),
    authorization_digest: 'a'.repeat(64),
  });
  const handler = createDelegatedAuthorizationResolveHandler({
    resolveDelegatedConsentAuthorization(value) {
      observed = value;
      return expected;
    },
  });

  const result = await handler({
    body: body(),
    principal: { service: 'hypervisor' },
  });

  assert.equal(result, expected);
  assert.deepEqual(observed, {
    consentId: 'delegated_consent_1',
    subjectId: 'learner.child.1',
    holderId: 'adult.guardian.1',
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    action: 'education.learner.event.append',
    dataScopes: ['learning-progress:write'],
  });
});

test('delegated authorization route rejects callers other than Hypervisor', async () => {
  const handler = createDelegatedAuthorizationResolveHandler({
    resolveDelegatedConsentAuthorization() {
      assert.fail('store must not be called');
    },
  });

  await assert.rejects(
    handler({ body: body(), principal: { service: 'gateway' } }),
    /Only Hypervisor may resolve delegated human authorization/,
  );
});

test('delegated authorization route rejects unsupported request fields before Grid resolution', async () => {
  const handler = createDelegatedAuthorizationResolveHandler({
    resolveDelegatedConsentAuthorization() {
      assert.fail('store must not be called');
    },
  });

  await assert.rejects(
    handler({
      body: body(request({ role: 'guardian' })),
      principal: { service: 'hypervisor' },
    }),
    /unsupported field: role/,
  );
});

test('delegated authorization route rejects non-canonical or duplicate scopes', async () => {
  const handler = createDelegatedAuthorizationResolveHandler({
    resolveDelegatedConsentAuthorization() {
      assert.fail('store must not be called');
    },
  });

  await assert.rejects(
    handler({
      body: body(request({ data_scopes: ['z-scope', 'a-scope'] })),
      principal: { service: 'hypervisor' },
    }),
    /sorted canonically/,
  );
  await assert.rejects(
    handler({
      body: body(request({ data_scopes: ['learning-progress:write', 'learning-progress:write'] })),
      principal: { service: 'hypervisor' },
    }),
    /must not contain duplicates/,
  );
});

test('delegated authorization route constructor rejects stores without the authority resolver', () => {
  assert.throws(
    () => createDelegatedAuthorizationResolveHandler({}),
    /requires resolveDelegatedConsentAuthorization/,
  );
});
