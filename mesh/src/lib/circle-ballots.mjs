import { KeyObject, createPublicKey, sign } from 'node:crypto';
import { canonicalJson, digestObject, sha256, ValidationError } from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import { circleStanding } from './circle-core.mjs';

/**
 * Signed Circle ballots and decision tallies. Inert contract laboratory.
 *
 * A Circle decision records participant_receipts but no votes, so on its own
 * nothing shows that an "accepted" decision met the charter's quorum and
 * approval thresholds. A ballot is a member's Ed25519 signature over an exact
 * (Circle, proposal, charter, choice, time) statement; a decision's
 * participant_receipts are the digests of the ballots it counts.
 * verifyCircleDecision recomputes the tally from those ballots under the
 * charter's decision_rule and refuses any decision whose outcome or receipts
 * differ.
 *
 * Electorate: principals whose membership counted, with a role declaring the
 * 'vote' mode, when the proposal opened. A ballot also needs that standing
 * when cast, before the proposal closes and no later than the decision.
 *
 * Member keys are supplied by the caller (voterKeys), as Praxis charters
 * supply principal keys: this module verifies signatures against them but
 * does not establish who holds which key. Nothing here grants authority,
 * executes an effect, or crosses a network.
 */

export const CIRCLE_BALLOT_SCHEMA = 'axiom-circle-ballot.v0';
export const CIRCLE_TALLY_SCHEMA = 'axiom-circle-tally.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const CHOICES = new Set(['approve', 'reject', 'abstain']);
const MAX_BALLOTS = 512;

export function createCircleBallot({
  circleId,
  proposalId,
  charterDigest,
  principalId,
  choice,
  castAt,
  privateKey
}) {
  const body = validateBallotBody({
    schema: CIRCLE_BALLOT_SCHEMA,
    circle_id: circleId,
    proposal_id: proposalId,
    charter_digest: charterDigest,
    principal_id: principalId,
    choice,
    cast_at: castAt,
    authority_effect: 'none'
  });
  const canonical = canonicalJson(body);
  return Object.freeze({
    body,
    attestation: Object.freeze({
      algorithm: 'Ed25519',
      digest: sha256(canonical),
      signature: sign(null, Buffer.from(canonical), privateKey).toString('base64url')
    })
  });
}

/** The receipt a decision lists for this ballot. */
export function circleBallotReceipt(ballot) {
  return digestObject(ballot.body);
}

export function verifyCircleDecision({ document, decisionId, ballots, voterKeys }) {
  const standing = circleStanding(document);
  const decision = document.decisions.find(item => item.decision_id === decisionId);
  if (!decision) throw new ValidationError(`Circle decision ${decisionId} does not exist`);
  const proposal = document.proposals.find(item => item.proposal_id === decision.proposal_id);
  const charterDigest = digestObject(document.charter);
  const rule = document.charter.decision_rule;

  const voteRoles = new Set(
    document.charter.roles
      .filter(role => role.declared_modes.includes('vote'))
      .map(role => role.role_id)
  );
  const canVote = (principalId, at) => {
    const membership = standing.principalMembershipAt(principalId, at);
    return Boolean(membership && membership.role_ids.some(role => voteRoles.has(role)));
  };

  const opened = new Date(proposal.created_at);
  const closes = new Date(proposal.closes_at);
  const decided = new Date(decision.decided_at);
  const electorate = new Set(
    [...new Set(document.memberships.map(item => item.principal_id))]
      .filter(principalId => canVote(principalId, opened))
  );

  if (!Array.isArray(ballots) || ballots.length > MAX_BALLOTS) {
    throw new ValidationError(`Circle ballots must be an array of at most ${MAX_BALLOTS}`);
  }
  const keys = normalizeVoterKeys(voterKeys);
  const counted = new Map();
  const seatByKey = new Map();
  const tally = { approve: 0, reject: 0, abstain: 0 };
  for (const ballot of ballots) {
    exactObject(ballot, 'Circle ballot', ['body', 'attestation']);
    const body = validateBallotBody(ballot.body);
    const principal = body.principal_id;
    if (
      body.circle_id !== document.circle.circle_id
      || body.proposal_id !== proposal.proposal_id
      || body.charter_digest !== charterDigest
    ) throw new ValidationError(`Ballot from ${principal} is not bound to this proposal and charter`);
    const cast = new Date(body.cast_at);
    if (cast < opened || cast >= closes || cast > decided) {
      throw new ValidationError(`Ballot from ${principal} was cast outside the voting window`);
    }
    if (!electorate.has(principal)) {
      throw new ValidationError(`${principal} could not vote when the proposal opened`);
    }
    if (!canVote(principal, cast)) {
      throw new ValidationError(`${principal} could not vote when the ballot was cast`);
    }
    if (counted.has(principal)) {
      throw new ValidationError(`${principal} cast more than one ballot`);
    }
    const key = keys.get(principal);
    if (!key) throw new ValidationError(`No voter key is known for ${principal}`);
    const seat = seatByKey.get(key.fingerprint);
    if (seat !== undefined && seat !== principal) {
      throw new ValidationError('One key cannot vote for more than one member');
    }
    if (!verifyObjectSignature(body, ballot.attestation, key.publicKey)) {
      throw new ValidationError(`Ballot signature from ${principal} is invalid`);
    }
    seatByKey.set(key.fingerprint, principal);
    counted.set(principal, circleBallotReceipt(ballot));
    tally[body.choice] += 1;
  }

  const decisive = tally.approve + tally.reject;
  const participation = decisive + (rule.abstention_counts_toward_quorum ? tally.abstain : 0);
  const quorumMet = electorate.size > 0
    && participation * 10_000 >= rule.quorum_basis_points * electorate.size;
  const approved = decisive > 0 && tally.approve * 10_000 >= rule.approval_basis_points * decisive;
  const outcome = proposal.status === 'withdrawn'
    ? 'withdrawn'
    : !quorumMet ? 'no-quorum' : approved ? 'accepted' : 'rejected';
  if (decision.outcome !== outcome) {
    throw new ValidationError(
      `Decision ${decision.decision_id} records '${decision.outcome}' but its ballots give '${outcome}'`
    );
  }

  const receipts = [...counted.values()].sort();
  const recorded = [...decision.participant_receipts].sort();
  if (canonicalJson(receipts) !== canonicalJson(recorded)) {
    throw new ValidationError(
      `Decision ${decision.decision_id} participant_receipts do not match the ballots counted`
    );
  }

  return Object.freeze({
    schema: CIRCLE_TALLY_SCHEMA,
    circle_id: document.circle.circle_id,
    decision_id: decision.decision_id,
    proposal_id: proposal.proposal_id,
    charter_digest: charterDigest,
    electorate: electorate.size,
    approve: tally.approve,
    reject: tally.reject,
    abstain: tally.abstain,
    quorum_met: quorumMet,
    approved,
    outcome,
    receipts: Object.freeze(receipts),
    authority_effect: 'none'
  });
}

function validateBallotBody(body) {
  exactObject(body, 'Circle ballot body', [
    'schema',
    'circle_id',
    'proposal_id',
    'charter_digest',
    'principal_id',
    'choice',
    'cast_at',
    'authority_effect'
  ]);
  if (
    body.schema !== CIRCLE_BALLOT_SCHEMA
    || !IDENTIFIER.test(body.circle_id ?? '')
    || !IDENTIFIER.test(body.proposal_id ?? '')
    || !/^[a-f0-9]{64}$/.test(body.charter_digest ?? '')
    || !IDENTIFIER.test(body.principal_id ?? '')
    || !CHOICES.has(body.choice)
    || body.authority_effect !== 'none'
  ) throw new ValidationError('Circle ballot is invalid');
  const cast = new Date(body.cast_at);
  if (typeof body.cast_at !== 'string' || Number.isNaN(cast.valueOf()) || cast.toISOString() !== body.cast_at) {
    throw new ValidationError('Circle ballot cast_at must be a canonical ISO timestamp');
  }
  return Object.freeze({ ...body });
}

function normalizeVoterKeys(voterKeys) {
  if (voterKeys === null || typeof voterKeys !== 'object' || Array.isArray(voterKeys)) {
    throw new ValidationError('Circle voter keys must map principals to Ed25519 public keys');
  }
  const keys = new Map();
  for (const [principal, value] of Object.entries(voterKeys)) {
    let publicKey;
    try {
      publicKey = value instanceof KeyObject && value.type === 'public'
        ? value
        : createPublicKey(value);
    } catch {
      throw new ValidationError(`Voter key for ${principal} is invalid`);
    }
    if (publicKey.asymmetricKeyType !== 'ed25519') {
      throw new ValidationError(`Voter key for ${principal} must be Ed25519`);
    }
    keys.set(principal, {
      publicKey,
      fingerprint: sha256(publicKey.export({ type: 'spki', format: 'der' }))
    });
  }
  return keys;
}

function exactObject(value, name, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${name} fields are invalid`);
  }
}
