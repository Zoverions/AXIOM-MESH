import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { verifyIntentAttenuation } from '../../../mesh/src/lib/authority-composition-guard.mjs';

const FIXTURE_HEADER = 'case_id\tgrant_verified\tintent_bound\tgrant_actions\tgrant_purposes\tgrant_destinations\tgrant_resources\tintent_actions\tintent_purposes\tintent_destinations\tintent_resources';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const MAX_SET_ITEMS = 128;
const POLICY_DIGEST = 'a'.repeat(64);

function parseBoolean(value, label) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${label} must be literal true or false`);
}

function validateIdentifier(value, label) {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`${label} contains an invalid identifier`);
  }
  return value;
}

function parseSet(value, label) {
  if (value === '') return [];
  const items = value.split(',');
  if (items.length > MAX_SET_ITEMS) {
    throw new Error(`${label} exceeds ${MAX_SET_ITEMS} items`);
  }
  for (const item of items) validateIdentifier(item, label);
  for (let index = 1; index < items.length; index += 1) {
    if (items[index - 1] >= items[index]) {
      throw new Error(`${label} must be sorted and unique`);
    }
  }
  return items;
}

export function decodeIntentAttenuationRow(line) {
  const columns = line.split('\t');
  if (columns.length !== 11) {
    throw new Error('Intent attenuation vector row must contain exactly 11 TSV columns');
  }

  return {
    caseId: validateIdentifier(columns[0], 'case_id'),
    grantVerified: parseBoolean(columns[1], 'grant_verified'),
    intentBound: parseBoolean(columns[2], 'intent_bound'),
    grantActions: parseSet(columns[3], 'grant_actions'),
    grantPurposes: parseSet(columns[4], 'grant_purposes'),
    grantDestinations: parseSet(columns[5], 'grant_destinations'),
    grantResources: parseSet(columns[6], 'grant_resources'),
    intentActions: parseSet(columns[7], 'intent_actions'),
    intentPurposes: parseSet(columns[8], 'intent_purposes'),
    intentDestinations: parseSet(columns[9], 'intent_destinations'),
    intentResources: parseSet(columns[10], 'intent_resources')
  };
}

export function parseIntentAttenuationFixture(text) {
  const normalized = text.replaceAll('\r\n', '\n');
  const withoutFinalNewline = normalized.endsWith('\n')
    ? normalized.slice(0, -1)
    : normalized;
  const lines = withoutFinalNewline.split('\n');
  if (lines.shift() !== FIXTURE_HEADER) {
    throw new Error('Intent attenuation fixture header is invalid');
  }

  const seen = new Set();
  return lines.map(line => {
    const candidate = decodeIntentAttenuationRow(line);
    if (seen.has(candidate.caseId)) {
      throw new Error(`Duplicate intent attenuation case_id: ${candidate.caseId}`);
    }
    seen.add(candidate.caseId);
    return candidate;
  });
}

export function evaluateIntentAttenuationCase(candidate) {
  if (candidate.grantVerified !== true) {
    throw new Error('Authority grant must be independently verified before attenuation evaluation');
  }
  if (candidate.intentBound !== true) {
    throw new Error('Authority intent must be pre-bound before attenuation evaluation');
  }

  const grant = {
    verified: true,
    grant_id: `grant:${candidate.caseId}`,
    issuer: 'gateway',
    principal_id: 'principal:test',
    resources: candidate.grantResources,
    actions: candidate.grantActions,
    purposes: candidate.grantPurposes,
    destinations: candidate.grantDestinations,
    expires_at: '2099-01-01T00:00:00.000Z',
    policy_digest: POLICY_DIGEST
  };
  const intent = {
    bound: true,
    actions: candidate.intentActions,
    purposes: candidate.intentPurposes,
    destinations: candidate.intentDestinations,
    resources: candidate.intentResources
  };

  return verifyIntentAttenuation(grant, intent);
}

export function runIntentAttenuationFixtureText(text) {
  return parseIntentAttenuationFixture(text)
    .map(candidate => {
      const result = evaluateIntentAttenuationCase(candidate);
      return [
        candidate.caseId,
        result.valid,
        result.checks.actions,
        result.checks.purposes,
        result.checks.destinations,
        result.checks.resources
      ].join('\t');
    })
    .join('\n');
}

export async function runIntentAttenuationFixture(path) {
  return runIntentAttenuationFixtureText(await readFile(path, 'utf8'));
}

async function readStdin() {
  process.stdin.setEncoding('utf8');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return chunks.join('');
}

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error('Usage: node intent_attenuation_oracle.mjs <fixture.tsv|->');
  const text = source === '-' ? await readStdin() : await readFile(source, 'utf8');
  process.stdout.write(`${runIntentAttenuationFixtureText(text)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
