import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVE_APPLICATION_SECURITY_BASELINE,
  validateApplicationSecurityBaseline
} from '../src/lib/application-security-profile.mjs';

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
