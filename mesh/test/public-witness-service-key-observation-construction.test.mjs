import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PublicWitnessServiceKeyObservationStore
} from '../src/lib/public-witness-service-key-observation-store.mjs';

test('W2 service-key observation stores cannot be constructed around caller-supplied state', () => {
  assert.throws(
    () => new PublicWitnessServiceKeyObservationStore(null, '/tmp/forged', {}, [], {}),
    /must be opened through the verified factory/
  );
});
