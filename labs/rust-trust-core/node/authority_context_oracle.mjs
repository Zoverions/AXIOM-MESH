import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { ValidationError } from '../../../mesh/src/lib/canonical.mjs';
import { evaluateAuthorityComposition } from '../../../mesh/src/lib/authority-composition-guard.mjs';

const MAX_JSONL_LINE_BYTES = 2 * 1024 * 1024;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const ENVELOPE_FIELDS = Object.freeze([
  'case_id',
  'grant',
  'intent',
  'request',
  'history',
  'restrictions'
]);

export const STAGE5B_NOW = Object.freeze(new Date('2030-01-01T00:00:00.000Z'));

function fail(message) {
  throw new Error(message);
}

function cursorFor(line) {
  if (line.length === 0) fail('Stage 5B JSON line must not be empty');
  if (line.length > MAX_JSONL_LINE_BYTES) {
    fail('Stage 5B JSON line exceeds the 2 MiB laboratory limit');
  }
  for (let index = 0; index < line.length; index += 1) {
    if (line.charCodeAt(index) > 0x7f) {
      fail('Stage 5B JSON transport must contain ASCII only');
    }
  }
  return { text: line, index: 0 };
}

function peek(cursor) {
  return cursor.text[cursor.index];
}

function skipSpaces(cursor) {
  while (peek(cursor) === ' ') cursor.index += 1;
}

function expect(cursor, expected, message) {
  if (peek(cursor) !== expected) fail(message);
  cursor.index += 1;
}

function consumeLiteral(cursor, literal) {
  if (cursor.text.slice(cursor.index, cursor.index + literal.length) !== literal) return false;
  cursor.index += literal.length;
  return true;
}

function scanString(cursor) {
  expect(cursor, '"', 'Stage 5B JSON string must begin with a quote');
  let decoded = '';
  while (cursor.index < cursor.text.length) {
    const character = cursor.text[cursor.index];
    cursor.index += 1;
    if (character === '"') return decoded;
    if (character === '\\') {
      const escaped = cursor.text[cursor.index];
      cursor.index += 1;
      if (escaped === '"' || escaped === '\\') {
        decoded += escaped;
        continue;
      }
      fail('Stage 5B JSON strings admit only quote and backslash escapes');
    }
    const code = character.charCodeAt(0);
    if (code < 0x20 || code > 0x7e) {
      fail('Stage 5B JSON strings must contain printable ASCII only');
    }
    decoded += character;
  }
  fail('Stage 5B JSON string is unterminated');
}

function scanArray(cursor) {
  expect(cursor, '[', 'Stage 5B JSON array must begin with [');
  skipSpaces(cursor);
  if (peek(cursor) === ']') {
    cursor.index += 1;
    return;
  }
  while (true) {
    scanValue(cursor);
    skipSpaces(cursor);
    if (peek(cursor) === ',') {
      cursor.index += 1;
      continue;
    }
    if (peek(cursor) === ']') {
      cursor.index += 1;
      return;
    }
    fail('Stage 5B JSON array must use comma-separated values');
  }
}

function scanObject(cursor) {
  expect(cursor, '{', 'Stage 5B JSON object must begin with {');
  skipSpaces(cursor);
  const keys = new Set();
  if (peek(cursor) === '}') {
    cursor.index += 1;
    return;
  }
  while (true) {
    skipSpaces(cursor);
    if (peek(cursor) !== '"') fail('Stage 5B JSON object keys must be strings');
    const key = scanString(cursor);
    if (keys.has(key)) fail(`Stage 5B JSON object contains duplicate key ${key}`);
    keys.add(key);
    skipSpaces(cursor);
    expect(cursor, ':', 'Stage 5B JSON object key must be followed by :');
    scanValue(cursor);
    skipSpaces(cursor);
    if (peek(cursor) === ',') {
      cursor.index += 1;
      continue;
    }
    if (peek(cursor) === '}') {
      cursor.index += 1;
      return;
    }
    fail('Stage 5B JSON object must use comma-separated fields');
  }
}

function scanValue(cursor) {
  skipSpaces(cursor);
  const current = peek(cursor);
  if (current === '{') return scanObject(cursor);
  if (current === '[') return scanArray(cursor);
  if (current === '"') {
    scanString(cursor);
    return;
  }
  if (current === 't' && consumeLiteral(cursor, 'true')) return;
  if (current === 'f' && consumeLiteral(cursor, 'false')) return;
  if (current === 'n' && consumeLiteral(cursor, 'null')) return;
  fail('Stage 5B JSON transport admits only object, array, string, boolean, and null values');
}

export function validateRestrictedJsonLine(line) {
  const cursor = cursorFor(String(line));
  skipSpaces(cursor);
  scanValue(cursor);
  skipSpaces(cursor);
  if (cursor.index !== cursor.text.length) {
    fail('Stage 5B JSON line contains trailing data');
  }
}

function validateCaseId(value) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    fail('Stage 5B case_id contains an invalid identifier');
  }
  return value;
}

function validateEnvelope(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    fail('Stage 5B fixture envelope must be an object');
  }
  const keys = Object.keys(candidate);
  if (keys.length !== ENVELOPE_FIELDS.length) {
    fail('Stage 5B fixture envelope must contain exactly the declared fields');
  }
  for (const key of keys) {
    if (!ENVELOPE_FIELDS.includes(key)) {
      fail(`Stage 5B fixture envelope contains unsupported field ${key}`);
    }
  }
  for (const field of ENVELOPE_FIELDS) {
    if (!Object.hasOwn(candidate, field)) {
      fail(`Stage 5B fixture envelope is missing required field ${field}`);
    }
  }
  validateCaseId(candidate.case_id);
  return candidate;
}

export function parseAuthorityContextFixture(text) {
  const normalized = String(text).replaceAll('\r\n', '\n');
  if (normalized.includes('\r')) {
    fail('Stage 5B JSONL fixture contains unsupported carriage return');
  }
  const withoutFinalNewline = normalized.endsWith('\n')
    ? normalized.slice(0, -1)
    : normalized;
  if (withoutFinalNewline.length === 0) {
    fail('Stage 5B JSONL fixture must contain at least one case');
  }
  const seen = new Set();
  return withoutFinalNewline.split('\n').map(line => {
    validateRestrictedJsonLine(line);
    const candidate = validateEnvelope(JSON.parse(line));
    if (seen.has(candidate.case_id)) {
      fail(`Duplicate Stage 5B case_id: ${candidate.case_id}`);
    }
    seen.add(candidate.case_id);
    return candidate;
  });
}

export function structurallyAdmitAuthorityContext(candidate) {
  const {
    case_id: caseId,
    grant,
    intent,
    request,
    history,
    restrictions
  } = candidate;
  try {
    evaluateAuthorityComposition({
      grant,
      intent,
      request,
      history,
      restrictions,
      now: STAGE5B_NOW
    });
    return Object.freeze({ caseId, structurallyAdmitted: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Object.freeze({ caseId, structurallyAdmitted: false });
    }
    throw error;
  }
}

export function runAuthorityContextFixtureText(text) {
  return parseAuthorityContextFixture(text)
    .map(candidate => {
      const result = structurallyAdmitAuthorityContext(candidate);
      return `${result.caseId}\t${result.structurallyAdmitted}`;
    })
    .join('\n');
}

export async function runAuthorityContextFixture(path) {
  return runAuthorityContextFixtureText(await readFile(path, 'utf8'));
}

async function readStdin() {
  process.stdin.setEncoding('utf8');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return chunks.join('');
}

async function main() {
  const source = process.argv[2];
  if (!source) {
    fail('Usage: node authority_context_oracle.mjs <fixture.jsonl|->');
  }
  const text = source === '-' ? await readStdin() : await readFile(source, 'utf8');
  process.stdout.write(`${runAuthorityContextFixtureText(text)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
