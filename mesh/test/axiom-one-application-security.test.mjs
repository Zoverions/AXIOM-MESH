import assert from 'node:assert/strict';
import test from 'node:test';
import policy from '../../apps/axiom-one/app-policy.json' with { type: 'json' };
import securityProfile from '../../apps/axiom-one/security-profile.json' with { type: 'json' };
import {
  checkAxiomOnePreview,
  validateAxiomOneApplicationSecurity
} from '../src/check-axiom-one.mjs';

test('AXIOM One reports a loopback-only application security profile with no hosted adapters active', async () => {
  const result = await checkAxiomOnePreview();
  assert.equal(result.application_security_schema, 'axiom-application-security-profile.v1');
  assert.equal(result.application_security_exposure, 'loopback-only');
  assert.equal(result.application_security_active_adapters, 0);
  assert.match(result.application_security_profile_digest, /^[a-f0-9]{64}$/);
});

test('AXIOM One rejects reusable-session drift while preview policy remains cookie-free and loopback-only', () => {
  const driftedProfile = structuredClone(securityProfile);
  driftedProfile.adapters.reusable_session = true;
  assert.throws(
    () => validateAxiomOneApplicationSecurity(policy, driftedProfile),
    /conflicts with preview policy/
  );
});
