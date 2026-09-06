import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '../../../mesh/src/lib/canonical.mjs';

const SAFE_INTEGER_MIN = -9007199254740991;
const SAFE_INTEGER_MAX = 9007199254740991;
const KEY_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function decodeScalarToken(token) {
  if (token === 'n') return null;
  if (token === 'b:true') return true;
  if (token === 'b:false') return false;
  if (token === 'z') return -0;
  if (token.startsWith('i:')) return decodeSafeInteger(token.slice(2));
  if (token.startsWith('s:')) return decodeAsciiString(token.slice(2));
  throw new TypeError(`Unsupported scalar token: ${token}`);
}

export function decodeVectorRow(line) {
  const columns = line.split('\t');
  if (columns.length !== 3) {
    throw new TypeError(`Canonical vector row must contain exactly 3 TSV columns: ${line}`);
  }
  const [caseId, kind, payload] = columns;
  if (!caseId) throw new TypeError('Canonical vector case_id must be non-empty');

  let value;
  switch (kind) {
    case 'null':
      if (payload !== '') throw new TypeError('null payload must be empty');
      value = null;
      break;
    case 'bool':
      if (payload === 'true') value = true;
      else if (payload === 'false') value = false;
      else throw new TypeError(`Invalid boolean payload: ${payload}`);
      break;
    case 'safe_integer':
      value = decodeSafeInteger(payload);
      break;
    case 'negative_zero':
      if (payload !== '-0') throw new TypeError('negative_zero payload must be -0');
      value = -0;
      break;
    case 'ascii_string':
      value = decodeAsciiString(payload);
      break;
    case 'scalar_array':
      value = payload === '' ? [] : payload.split(',').map(decodeScalarToken);
      break;
    case 'ascii_key_object':
      value = decodeAsciiKeyObject(payload);
      break;
    default:
      throw new TypeError(`Unknown canonical vector kind: ${kind}`);
  }

  return { caseId, value };
}

export function parseFixture(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.shift() !== 'case_id\tkind\tpayload') {
    throw new TypeError('Canonical vector fixture header is invalid');
  }
  const seen = new Set();
  return lines.map(line => {
    const decoded = decodeVectorRow(line);
    if (seen.has(decoded.caseId)) {
      throw new TypeError(`Duplicate canonical vector case_id: ${decoded.caseId}`);
    }
    seen.add(decoded.caseId);
    return decoded;
  });
}

export function runFixtureText(text) {
  return parseFixture(text)
    .map(({ caseId, value }) => `${caseId}\t${canonicalJson(value)}`)
    .join('\n');
}

export async function runFixture(path) {
  return runFixtureText(await readFile(path, 'utf8'));
}

function decodeSafeInteger(payload) {
  if (!/^-?(?:0|[1-9][0-9]*)$/.test(payload) || payload === '-0') {
    throw new TypeError(`Invalid safe integer payload: ${payload}`);
  }
  const value = Number(payload);
  if (!Number.isSafeInteger(value) || value < SAFE_INTEGER_MIN || value > SAFE_INTEGER_MAX) {
    throw new TypeError(`Safe integer payload is outside the admitted range: ${payload}`);
  }
  return value;
}

function decodeAsciiString(payload) {
  for (const character of payload) {
    const code = character.codePointAt(0);
    if (code < 0x20 || code > 0x7e || character === '"' || character === '\\') {
      throw new TypeError(`String payload is outside canonical-value-v0 ASCII: ${payload}`);
    }
  }
  return payload;
}

function decodeAsciiKeyObject(payload) {
  const output = Object.create(null);
  const seen = new Set();
  if (payload === '') return output;
  for (const pair of payload.split(';')) {
    const separator = pair.indexOf('=');
    if (separator <= 0 || separator === pair.length - 1) {
      throw new TypeError(`Malformed object pair: ${pair}`);
    }
    const key = pair.slice(0, separator);
    const token = pair.slice(separator + 1);
    if (!KEY_PATTERN.test(key)) throw new TypeError(`Invalid object key: ${key}`);
    if (seen.has(key)) throw new TypeError(`Duplicate object key: ${key}`);
    seen.add(key);
    output[key] = decodeScalarToken(token);
  }
  return output;
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new TypeError('Usage: canonical_oracle.mjs <fixture-path|->');
  const text = path === '-' ? await readFile(0, 'utf8') : await readFile(path, 'utf8');
  process.stdout.write(`${runFixtureText(text)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
