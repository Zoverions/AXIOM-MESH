import { canonicalJson, sha256 } from './canonical.mjs';

const ACTIONS = Object.freeze([
  'system.echo',
  'system.hash',
  'memory.put',
  'export.create'
]);
const RISKS = Object.freeze(['low', 'medium', 'high', 'critical']);

export function deterministicPolicyCases(seed, count = 128) {
  const random = seededRandom(seed);
  return Array.from({ length: assertCount(count) }, (_, index) => {
    const action = ACTIONS[index % ACTIONS.length];
    const globalRiskIndex = integer(random, 0, RISKS.length - 1);
    const localRiskIndex = integer(random, globalRiskIndex, RISKS.length - 1);
    const globalConfirmations = integer(random, 0, 2);
    const localConfirmations = integer(random, globalConfirmations, 4);
    const globalScopes = uniqueSorted([
      'intent:execute',
      ...(random() > 0.5 ? ['global:verified'] : [])
    ]);
    const localScopes = uniqueSorted([
      ...globalScopes,
      ...(random() > 0.5 ? ['local:verified'] : []),
      ...(random() > 0.75 ? ['user:confirmed'] : [])
    ]);
    const denied = random() > 0.8;
    const localDenied = denied || random() <= 0.1;
    const globalRisk = RISKS[globalRiskIndex];
    const localRisk = RISKS[localRiskIndex];
    return {
      id: `iam04-${index}`,
      action,
      layers: [
        {
          version: `property.global.${index}`,
          actions: {
            [action]: {
              decision: denied ? 'deny' : 'allow',
              risk: globalRisk,
              required_scopes: globalScopes,
              required_confirmations: globalConfirmations,
              requires_independent_approval: !denied && globalRiskIndex >= 2,
              tool: action === 'system.hash' ? 'builtin.hash' : 'builtin.echo'
            }
          }
        },
        {
          version: `property.local.${index}`,
          actions: {
            [action]: {
              decision: localDenied ? 'deny' : 'allow',
              risk: localRisk,
              required_scopes: localScopes,
              required_confirmations: localConfirmations,
              requires_independent_approval: !localDenied && localRiskIndex >= 2,
              tool: action === 'system.hash' ? 'builtin.hash' : 'builtin.echo'
            }
          }
        }
      ]
    };
  });
}

export function deterministicJournalCases(seed, count = 128) {
  const random = seededRandom(seed);
  return Array.from({ length: assertCount(count) }, (_, index) => {
    const lineCount = integer(random, 2, 12);
    const entries = [];
    let total = 0;
    for (let line = 0; line < lineCount - 1; line += 1) {
      let amount = integer(random, -1_000_000, 1_000_000);
      if (amount === 0) amount = 1;
      entries.push({
        account_id: `property-account-${line}`,
        amount,
        metadata: { fixture: index, line }
      });
      total += amount;
    }
    entries.push({
      account_id: `property-account-${lineCount - 1}`,
      amount: total === 0 ? 1 : -total,
      metadata: { fixture: index, line: lineCount - 1 }
    });
    if (total === 0) entries[0].amount -= 1;
    return {
      id: `econ02-${index}`,
      owner: 'property-owner',
      unit: 'AXIOM-TEST',
      entries
    };
  });
}

export function propertyFixtureDigest(value) {
  return sha256(canonicalJson(value));
}

function seededRandom(seed) {
  const normalized = typeof seed === 'number'
    ? seed >>> 0
    : Number.parseInt(sha256(String(seed)).slice(0, 8), 16) >>> 0;
  let state = normalized || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function integer(random, minimum, maximum) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function assertCount(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
    throw new TypeError('Property fixture count must be an integer between 1 and 10000');
  }
  return value;
}
