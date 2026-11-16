import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CREDENTIAL_BROKER_PROVIDER_SCHEMA,
  CREDENTIAL_BROKER_REQUEST_SCHEMA,
  evaluateCredentialBrokerRequest,
  validateCredentialBrokerProvider,
  validateCredentialBrokerRequest
} from '../src/lib/credential-broker-contract.mjs';

function providerFixture() {
  return {
    schema: CREDENTIAL_BROKER_PROVIDER_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    provider_id: 'provider.1password.external',
    provider_kind: 'password-manager',
    integration_mode: 'external-native',
    supported_credential_classes: ['password'],
    supported_actions: ['authenticate.fill'],
    allowed_destinations: ['https://example.com'],
    approval_mode: 'always-human',
    secret_visibility: 'trusted-broker-only',
    model_secret_access: false,
    live_invocation: false,
    authority_effect: 'none',
    network_effect: 'none'
  };
}

function requestFixture() {
  return {
    schema: CREDENTIAL_BROKER_REQUEST_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    request_id: 'request.login.example',
    principal_id: 'principal.agent.worker',
    provider_id: 'provider.1password.external',
    credential_ref: 'credential.example.login',
    credential_class: 'password',
    exact_action: 'authenticate.fill',
    purpose: 'signin.example',
    exact_destination: 'https://example.com',
    prepared_effect_digest: 'a'.repeat(64),
    issued_at: '2026-09-18T05:00:00.000Z',
    expires_at: '2026-09-18T05:10:00.000Z',
    single_use: true,
    requires_human_approval: true,
    authority_effect: 'none',
    network_effect: 'none',
    broker_invocation: false
  };
}

test('1Password-shaped provider profile remains inert and secret-free', () => {
  const provider = providerFixture();
  assert.equal(validateCredentialBrokerProvider(provider), provider);
  assert.equal(provider.model_secret_access, false);
  assert.equal(provider.live_invocation, false);
  assert.equal(provider.authority_effect, 'none');
  assert.equal(provider.network_effect, 'none');
});

test('credential broker request remains exact, single-use, human-approved, and non-invoking', () => {
  const request = requestFixture();
  assert.equal(validateCredentialBrokerRequest(request), request);
  assert.equal(request.single_use, true);
  assert.equal(request.requires_human_approval, true);
  assert.equal(request.broker_invocation, false);
});

test('evaluation returns only broker-safe metadata and never credential material', () => {
  const result = evaluateCredentialBrokerRequest({
    request: requestFixture(),
    provider: providerFixture(),
    evaluated_at: '2026-09-18T05:05:00.000Z'
  });
  assert.equal(result.valid, true);
  assert.equal(result.requires_trusted_credential_broker, true);
  assert.equal(result.requires_human_approval, true);
  assert.equal(result.secret_material_returned, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.broker_invocation, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.hasOwn(result, 'credential_ref'), false);
  assert.equal(Object.hasOwn(result, 'credential_value'), false);
  assert.equal(Object.hasOwn(result, 'secret'), false);
  assert.equal(Object.hasOwn(result, 'token'), false);
  assert.equal(Object.hasOwn(result, 'cookie'), false);
  assert.doesNotMatch(JSON.stringify(result), /credential\.example\.login/);
});

test('secret-bearing and unknown fields fail closed', () => {
  for (const field of ['password', 'secret', 'token', 'cookie', 'totp_seed', 'private_key']) {
    const request = requestFixture();
    request[field] = 'must-not-be-accepted';
    assert.throws(() => validateCredentialBrokerRequest(request), /unknown field/i);
  }
  const provider = providerFixture();
  provider.api_key = 'must-not-be-accepted';
  assert.throws(() => validateCredentialBrokerProvider(provider), /unknown field/i);
});

test('provider, action, credential class, and destination must match exactly', () => {
  const cases = [
    request => { request.provider_id = 'provider.other'; },
    request => { request.exact_action = 'authenticate.other'; },
    request => { request.credential_class = 'totp'; },
    request => { request.exact_destination = 'https://other.example'; }
  ];
  for (const mutate of cases) {
    const request = requestFixture();
    mutate(request);
    assert.throws(() => evaluateCredentialBrokerRequest({
      request,
      provider: providerFixture(),
      evaluated_at: '2026-09-18T05:05:00.000Z'
    }));
  }
});

test('stale, future, oversized, and reusable requests fail closed', () => {
  assert.throws(() => evaluateCredentialBrokerRequest({
    request: requestFixture(), provider: providerFixture(), evaluated_at: '2026-09-18T05:10:00.000Z'
  }), /expired/i);
  assert.throws(() => evaluateCredentialBrokerRequest({
    request: requestFixture(), provider: providerFixture(), evaluated_at: '2026-09-18T04:59:59.000Z'
  }), /not yet valid/i);

  const oversized = requestFixture();
  oversized.expires_at = '2026-09-18T05:15:00.001Z';
  assert.throws(() => validateCredentialBrokerRequest(oversized), /15 minutes/i);

  const reusable = requestFixture();
  reusable.single_use = false;
  assert.throws(() => validateCredentialBrokerRequest(reusable), /single-use/i);
});

test('v0 cannot relax human approval, secret visibility, or activation boundaries', () => {
  const provider = providerFixture();
  provider.approval_mode = 'authority-policy';
  assert.throws(() => validateCredentialBrokerProvider(provider), /always-human/i);

  const visible = providerFixture();
  visible.model_secret_access = true;
  assert.throws(() => validateCredentialBrokerProvider(visible), /secret-visibility/i);

  const live = providerFixture();
  live.live_invocation = true;
  assert.throws(() => validateCredentialBrokerProvider(live), /activation boundary/i);

  const request = requestFixture();
  request.broker_invocation = true;
  assert.throws(() => validateCredentialBrokerRequest(request), /activation boundary/i);
});

test('destinations are exact HTTPS origins without embedded credentials or paths', () => {
  for (const destination of [
    'http://example.com',
    'https://user:pass@example.com',
    'https://example.com/path',
    'https://example.com?x=1',
    'https://example.com#x',
    'https://example.com/'
  ]) {
    const request = requestFixture();
    request.exact_destination = destination;
    assert.throws(() => validateCredentialBrokerRequest(request), /HTTPS origin/i);
  }
});

test('validator module imports only the local canonical helper', async () => {
  const sourceUrl = new URL('../src/lib/credential-broker-contract.mjs', import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['./canonical.mjs']);
  assert.doesNotMatch(source, /node:(?:fs|net|http|https|child_process)|fetch\s*\(|process\.env|spawn\s*\(|exec\s*\(/);
});
