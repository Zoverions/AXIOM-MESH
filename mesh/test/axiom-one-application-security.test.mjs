import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAxiomOnePreview } from '../src/check-axiom-one.mjs';

test('AXIOM One reports a loopback-only application security profile with no hosted adapters active', async () => {
  const result = await checkAxiomOnePreview();
  assert.equal(result.application_security_schema, 'axiom-application-security-profile.v1');
  assert.equal(result.application_security_exposure, 'loopback-only');
  assert.equal(result.application_security_active_adapters, 0);
  assert.match(result.application_security_profile_digest, /^[a-f0-9]{64}$/);
});
