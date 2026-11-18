import assert from 'node:assert/strict';
import test from 'node:test';

import { sessionFixtureExpiry } from '../test-support/session-fixture-clock.mjs';

test('session fixture expiry is derived from the explicit reference clock', () => {
  const referenceTime = new Date('2026-08-17T19:00:00.000Z');

  assert.equal(
    sessionFixtureExpiry(referenceTime),
    '2026-08-18T19:00:00.000Z'
  );
  assert.equal(referenceTime.toISOString(), '2026-08-17T19:00:00.000Z');
});

test('session fixture expiry rejects a missing or invalid reference clock', () => {
  assert.throws(
    () => sessionFixtureExpiry(),
    /referenceTime must be a valid Date/
  );
  assert.throws(
    () => sessionFixtureExpiry(new Date(Number.NaN)),
    /referenceTime must be a valid Date/
  );
});
