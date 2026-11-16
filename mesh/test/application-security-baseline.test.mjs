import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertBrowserAssetSafe,
  checkApplicationSecurity
} from '../src/check-application-security.mjs';
import {
  ACTIVE_APPLICATION_SECURITY_BASELINE,
  validateApplicationSecurityBaseline,
  validateApplicationSecurityProfile
} from '../src/lib/application-security-profile.mjs';

function validProfile() {
  return {
    schema: 'axiom-application-security-profile.v1',
    version: 1,
    application_id: 'fixture-app',
    status: 'experimental',
    exposure: 'loopback-only',
    browser_untrusted: true,
    adapters: {
      hosted_web: false,
      relational_database: false,
      reusable_session: false,
      password_store: false,
      file_upload: false
    },
    controls: Object.fromEntries(
      ACTIVE_APPLICATION_SECURITY_BASELINE.universal_controls.map(name => [name, 'enforced'])
    ),
    evidence: ['mesh/test/application-security-baseline.test.mjs']
  };
}

test('application security baseline has exact v1 identity and deny defaults', () => {
  assert.equal(validateApplicationSecurityBaseline(ACTIVE_APPLICATION_SECURITY_BASELINE), true);
  assert.equal(ACTIVE_APPLICATION_SECURITY_BASELINE.schema, 'axiom-application-security-baseline.v1');
  assert.equal(ACTIVE_APPLICATION_SECURITY_BASELINE.version, 1);
  assert.equal(ACTIVE_APPLICATION_SECURITY_BASELINE.browser_trust, 'untrusted');
  assert.equal(ACTIVE_APPLICATION_SECURITY_BASELINE.unknown_state, 'deny');
  assert.deepEqual(ACTIVE_APPLICATION_SECURITY_BASELINE.adapters, [
    'hosted_web',
    'relational_database',
    'reusable_session',
    'password_store',
    'file_upload'
  ]);
});

test('application security baseline rejects weakened browser trust', () => {
  const weakened = structuredClone(ACTIVE_APPLICATION_SECURITY_BASELINE);
  weakened.browser_trust = 'trusted';
  assert.throws(() => validateApplicationSecurityBaseline(weakened), /weakened/);
});

test('application security profile accepts a bounded loopback application', () => {
  assert.equal(validateApplicationSecurityProfile(validProfile()), true);
});

test('application security profile rejects internet exposure without hosted-web controls', () => {
  const profile = validProfile();
  profile.exposure = 'internet';
  assert.throws(() => validateApplicationSecurityProfile(profile), /hosted_web/);
});

test('repository application security check covers registered applications without leaking credential material', async () => {
  const result = await checkApplicationSecurity();
  assert.equal(result.valid, true);
  assert.equal(result.applications, 1);
  assert.equal(result.scanned_browser_assets, 5);
  assert.equal(result.active_adapters, 0);
  assert.equal(JSON.stringify(result).includes('Bearer '), false);
});

test('browser asset security rejects secret-like credentials without echoing the value', () => {
  const secret = `AIza${'A'.repeat(35)}`;
  assert.throws(
    () => assertBrowserAssetSafe(
      Buffer.from(`export const publicKey = '${secret}';`),
      'fixture.mjs',
      { auditKey: Buffer.alloc(32, 7) }
    ),
    error => {
      assert.match(error.message, /secret-like credential candidate/);
      assert.equal(error.message.includes(secret), false);
      return true;
    }
  );
});

test('browser asset security rejects unsafe HTML injection primitives', () => {
  assert.throws(
    () => assertBrowserAssetSafe(Buffer.from('element.innerHTML = userContent;'), 'fixture.mjs'),
    /browser security boundary/
  );
});
