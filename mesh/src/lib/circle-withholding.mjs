import { digestObject, ValidationError } from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import { CIRCLE_HEADS_SCHEMA, CIRCLE_NODE_STATEMENT_SCHEMA } from './circle-exchange.mjs';

/**
 * Withholding findings from node statements (laboratory, with the transport).
 *
 * A node signs, in every answer, the heads it claims to hold
 * (circle-transport.mjs). A node can still leave updates out of what it
 * serves; this module turns what its own signatures contradict into
 * findings anyone holding the Circle can verify again:
 *
 * - heads_regressed: a later statement from the same node claims less of a
 *   key log than an earlier one did. Both statements are the evidence.
 * - own_update_withheld: the node's statement omits an update from the
 *   node's own log whose record the node itself dated no later than the
 *   statement. The statement and that update, both signed by the node, are
 *   the evidence.
 *
 * A node's answer to an offer signs its heads after applying the offer, so
 * the member who offered holds the node's own statement that it had those
 * updates. Members publish such statements as `node_evidence` records, and
 * detectCircleWithholdingAcross compares every statement from one node,
 * whoever received it: a later statement to anyone that claims less than an
 * earlier one is a heads_regressed finding. So a node that acknowledged a
 * member's updates and then serves others without them is found out once
 * the member's evidence reaches them. Updates a node received but never
 * acknowledged in a statement stay undetectable.
 *
 * A finding is evidence for people to act on. It changes no standing,
 * excludes nothing from the view and triggers nothing.
 */

export const CIRCLE_WITHHOLDING_FINDING_SCHEMA = 'axiom-circle-withholding-finding.v0';
const MAX_HEADS = 8192;

/**
 * Checks one piece of node evidence ({ statement, heads }) against the
 * replica: the heads must be the ones the statement signed, and the
 * statement must verify against the node's announced key. Returns the
 * statement body.
 */
export function verifyCircleNodeEvidence(replica, evidence) {
  const statement = evidence?.statement;
  const heads = evidence?.heads;
  const body = statement?.body;
  if (
    body?.schema !== CIRCLE_NODE_STATEMENT_SCHEMA
    || body.genesis_digest !== replica.genesisDigest
    || heads?.schema !== CIRCLE_HEADS_SCHEMA
    || heads.genesis_digest !== replica.genesisDigest
    || !Array.isArray(heads.heads)
    || heads.heads.length > MAX_HEADS
    || body.heads_digest !== digestObject(heads)
  ) throw new ValidationError('Circle node evidence is invalid');
  const key = replica.announcedKey(body.principal_id, body.key_id);
  let valid = false;
  try {
    valid = Boolean(key) && verifyObjectSignature(body, statement.attestation, key);
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError('Circle node evidence signature cannot be verified');
  return body;
}

/**
 * Findings for `current` node evidence: against `previous` evidence from
 * the same node, and against the updates the replica holds from that node's
 * own logs.
 */
export function detectCircleWithholding({ replica, previous = null, current }) {
  const statement = verifyCircleNodeEvidence(replica, current);
  const findings = [];
  const claimed = new Map(current.heads.heads.map(head => [`${head.author}\u0000${head.key_id}`, head.counter]));

  if (previous) {
    const earlier = verifyCircleNodeEvidence(replica, previous);
    if (earlier.principal_id === statement.principal_id && at(earlier.issued_at) < at(statement.issued_at)) {
      for (const head of previous.heads.heads) {
        const now = claimed.get(`${head.author}\u0000${head.key_id}`) ?? 0;
        if (now < head.counter) {
          findings.push(finding('heads_regressed', {
            author: head.author,
            key_id: head.key_id,
            earlier_counter: head.counter,
            later_counter: now,
            evidence: [previous, current]
          }));
        }
      }
    }
  }

  for (const log of replica.heads().heads.filter(head => head.author === statement.principal_id)) {
    const counter = claimed.get(`${log.author}\u0000${log.key_id}`) ?? 0;
    if (log.counter <= counter) continue;
    const withheld = replica.authoredAfter({ author: log.author, keyId: log.key_id, counter })
      .find(item => at(item.recorded_at) <= at(statement.issued_at));
    if (withheld) {
      findings.push(finding('own_update_withheld', {
        author: log.author,
        key_id: log.key_id,
        claimed_counter: counter,
        withheld_counter: withheld.counter,
        recorded_at: withheld.recorded_at,
        evidence: [current],
        update: withheld.update
      }));
    }
  }
  return findings;
}

/**
 * heads_regressed findings across statements from any caller: node evidence
 * the replica's members published (`view.node_evidence`) together with the
 * caller's own. For each node, statements are taken in the node's own time
 * order; any statement that claims less of a key log than an earlier
 * statement's peak for it is a finding, with that earlier statement as
 * evidence. Evidence that cannot be verified is skipped.
 */
export function detectCircleWithholdingAcross({ replica, evidence }) {
  const byNode = new Map();
  for (const item of evidence) {
    let body;
    try {
      body = verifyCircleNodeEvidence(replica, item);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      continue;
    }
    const list = byNode.get(body.principal_id) ?? [];
    list.push({ item, time: at(body.issued_at), digest: digestObject(body) });
    byNode.set(body.principal_id, list);
  }
  const findings = [];
  for (const list of byNode.values()) {
    list.sort((left, right) => left.time - right.time || (left.digest < right.digest ? -1 : left.digest > right.digest ? 1 : 0));
    // Per key log: the highest counter claimed at any earlier instant, and
    // where. Statements signed at the same instant are compared only with
    // earlier ones, then raise the peaks together.
    const peaks = new Map();
    for (let start = 0; start < list.length;) {
      let end = start;
      while (end < list.length && list[end].time === list[start].time) end += 1;
      const group = list.slice(start, end).map(({ item, time }) => ({
        item,
        time,
        claimed: new Map(item.heads.heads.map(head => [`${head.author}\u0000${head.key_id}`, head]))
      }));
      for (const { item, claimed } of group) {
        for (const [log, peak] of peaks) {
          const now = claimed.get(log)?.counter ?? 0;
          if (now < peak.counter) {
            findings.push(finding('heads_regressed', {
              author: peak.author,
              key_id: peak.key_id,
              earlier_counter: peak.counter,
              later_counter: now,
              evidence: [peak.item, item]
            }));
          }
        }
      }
      for (const { item, time, claimed } of group) {
        for (const [log, head] of claimed) {
          if ((peaks.get(log)?.counter ?? 0) < head.counter) {
            peaks.set(log, { author: head.author, key_id: head.key_id, counter: head.counter, item, time });
          }
        }
      }
      start = end;
    }
  }
  return findings;
}

/** Re-derives a finding from its own evidence; throws if it does not hold. */
export function verifyCircleWithholdingFinding(replica, value) {
  if (value?.schema !== CIRCLE_WITHHOLDING_FINDING_SCHEMA) throw new ValidationError('Circle withholding finding is invalid');
  const statements = (value.evidence ?? []).map(item => verifyCircleNodeEvidence(replica, item));
  const last = value.evidence.at(-1);
  const counterIn = (evidence, author, keyId) => evidence.heads.heads
    .find(head => head.author === author && head.key_id === keyId)?.counter ?? 0;
  if (value.kind === 'heads_regressed') {
    const [earlier, later] = statements;
    if (
      statements.length !== 2
      || earlier.principal_id !== later.principal_id
      || !(at(earlier.issued_at) < at(later.issued_at))
      || counterIn(value.evidence[0], value.author, value.key_id) !== value.earlier_counter
      || counterIn(value.evidence[1], value.author, value.key_id) !== value.later_counter
      || !(value.later_counter < value.earlier_counter)
    ) throw new ValidationError('Circle withholding finding does not hold');
    return true;
  }
  if (value.kind === 'own_update_withheld') {
    const [statement] = statements;
    const body = value.update?.body;
    const key = body && replica.announcedKey(body.author, body.key_id);
    let signedByNode = false;
    try {
      signedByNode = Boolean(key) && verifyObjectSignature(body, value.update.attestation, key);
    } catch {
      signedByNode = false;
    }
    const held = replica.authoredAfter({ author: value.author, keyId: value.key_id, counter: value.withheld_counter - 1 })[0];
    if (
      statements.length !== 1
      || !signedByNode
      || body.author !== statement.principal_id
      || body.author !== value.author
      || body.key_id !== value.key_id
      || body.counter !== value.withheld_counter
      || counterIn(last, value.author, value.key_id) !== value.claimed_counter
      || !(value.claimed_counter < value.withheld_counter)
      || held?.digest !== digestObject(body)
      || !(at(held.recorded_at) <= at(statement.issued_at))
    ) throw new ValidationError('Circle withholding finding does not hold');
    return true;
  }
  throw new ValidationError('Circle withholding finding kind is unknown');
}

// Times are compared as instants, never as strings.
function at(value) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new ValidationError('Circle withholding time is invalid');
  return time;
}

function finding(kind, fields) {
  return Object.freeze({ schema: CIRCLE_WITHHOLDING_FINDING_SCHEMA, kind, ...fields });
}
