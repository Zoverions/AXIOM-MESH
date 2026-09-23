import {
  ValidationError,
  assertPlainObject
} from './canonical.mjs';
import { verifyBeaconObservationEnvelope } from './beacon-observation-candidate.mjs';
import {
  claimExternalObservationReplay,
  readExternalObservationReplayState
} from './external-observation-replay-store.mjs';

const OPTION_KEYS = Object.freeze([
  'state_path',
  'now',
  'max_entries',
  'max_state_bytes'
]);

export async function consumeBeaconObservationCandidate(envelope, options) {
  const normalizedOptions = normalizeOptions(options);
  const replayState = await readExternalObservationReplayState(normalizedOptions);
  const seenReplayKeys = replayState.entries.map(entry => entry.replay_key);

  const verified = verifyBeaconObservationEnvelope(envelope, {
    now: normalizedOptions.now,
    seen_replay_keys: seenReplayKeys
  });

  const claim = await claimExternalObservationReplay({
    state_path: normalizedOptions.state_path,
    sender_id: envelope.sender_id,
    nonce: envelope.nonce,
    now: normalizedOptions.now,
    expires_at: envelope.expires_at,
    ...(normalizedOptions.max_entries === undefined
      ? {}
      : { max_entries: normalizedOptions.max_entries }),
    ...(normalizedOptions.max_state_bytes === undefined
      ? {}
      : { max_state_bytes: normalizedOptions.max_state_bytes })
  });

  if (claim.replay_key !== verified.replay_key) {
    throw new ValidationError('Beacon observation durable replay claim does not match verified replay identity');
  }

  return Object.freeze({
    ...verified,
    replay_persistence: true,
    replay_claimed: true,
    replay_state_digest: claim.state_digest,
    active_replay_entries: claim.active_entries
  });
}

function normalizeOptions(options) {
  assertPlainObject(options, 'Beacon observation consumer options');
  const actual = Object.keys(options).sort();
  const expected = [...OPTION_KEYS].sort();
  for (const key of actual) {
    if (!expected.includes(key)) {
      throw new ValidationError(`Beacon observation consumer options contain unknown field: ${key}`);
    }
  }
  if (!Object.hasOwn(options, 'state_path') || !Object.hasOwn(options, 'now')) {
    throw new ValidationError('Beacon observation consumer options require state_path and now');
  }
  return {
    state_path: options.state_path,
    now: options.now,
    ...(Object.hasOwn(options, 'max_entries') ? { max_entries: options.max_entries } : {}),
    ...(Object.hasOwn(options, 'max_state_bytes')
      ? { max_state_bytes: options.max_state_bytes }
      : {})
  };
}
