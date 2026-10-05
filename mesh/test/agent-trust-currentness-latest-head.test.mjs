import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateAgentCurrentnessAtEffect } from '../src/lib/agent-trust-currentness-checkpoint.mjs';

test('effect-boundary currentness cannot omit the expected retained latest checkpoint head', () => {
  assert.throws(
    () => evaluateAgentCurrentnessAtEffect({}),
    /expectedLatestCheckpointDigest/
  );
});
