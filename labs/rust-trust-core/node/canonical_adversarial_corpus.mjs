import { pathToFileURL } from 'node:url';

export const FIXED_SEEDS = Object.freeze([
  0x4158494F,
  0x4D455348,
  0xC0DEF00D,
  0x5EED0004
]);

export const VALID_CASES_PER_SEED = 256;
export const INVALID_CASES_PER_SEED = 64;

const SAFE_INTEGER_MIN = -9007199254740991;
const SAFE_INTEGER_MAX = 9007199254740991;

const VALID_BASE_CATEGORIES = Object.freeze([
  'null_or_bool',
  'zero_or_near',
  'safe_min',
  'safe_max',
  'near_safe_min',
  'near_safe_max',
  'negative_zero',
  'ascii_string',
  'empty_array',
  'mixed_array',
  'negative_zero_array',
  'empty_object',
  'single_object',
  'unordered_object',
  'adjacent_prefix_keys'
]);

const INVALID_CATEGORIES = Object.freeze([
  'unknown_kind',
  'duplicate_case_id',
  'invalid_boolean',
  'integer_above_max',
  'integer_below_min',
  'invalid_negative_zero',
  'excluded_string_character',
  'malformed_array_token',
  'nested_token',
  'invalid_object_key',
  'duplicate_object_key',
  'wrong_tsv_columns',
  'payload_over_limit',
  'array_over_limit',
  'object_over_limit',
  'key_over_limit'
]);

export function xorshift32(state) {
  state = (state ^ (state << 13)) >>> 0;
  state = (state ^ (state >>> 17)) >>> 0;
  state = (state ^ (state << 5)) >>> 0;
  return state >>> 0;
}

function seedHex(seed) {
  return (seed >>> 0).toString(16).padStart(8, '0');
}

function stateCursor(seed) {
  let state = seed >>> 0;
  return () => {
    state = xorshift32(state);
    return state;
  };
}

function scalarToken(value, selector) {
  switch (selector % 6) {
    case 0: return 'n';
    case 1: return `b:${(value & 1) === 0 ? 'false' : 'true'}`;
    case 2: return `i:${(value % 2001) - 1000}`;
    case 3: return 'z';
    case 4: return `s:s${value.toString(16)}`;
    default: return `i:${value % 97}`;
  }
}

function validCase(seed, sequence, category, kind, payload, extra = {}) {
  return {
    caseId: `adv_${seedHex(seed)}_${String(sequence).padStart(3, '0')}_${category}`,
    category,
    kind,
    payload,
    ...extra
  };
}

function makeValidCase(seed, sequence, category, ordinal, next) {
  const a = next();
  const b = next();
  switch (category) {
    case 'null_or_bool':
      return ordinal % 3 === 0
        ? validCase(seed, sequence, category, 'null', '')
        : validCase(seed, sequence, category, 'bool', (a & 1) === 0 ? 'false' : 'true');
    case 'zero_or_near': {
      const values = [0, 1, -1, 2, -2, 7, -7];
      return validCase(seed, sequence, category, 'safe_integer', String(values[a % values.length]));
    }
    case 'safe_min':
      return validCase(seed, sequence, category, 'safe_integer', String(SAFE_INTEGER_MIN));
    case 'safe_max':
      return validCase(seed, sequence, category, 'safe_integer', String(SAFE_INTEGER_MAX));
    case 'near_safe_min':
      return validCase(
        seed,
        sequence,
        category,
        'safe_integer',
        String(SAFE_INTEGER_MIN + 1 + (a % 32))
      );
    case 'near_safe_max':
      return validCase(
        seed,
        sequence,
        category,
        'safe_integer',
        String(SAFE_INTEGER_MAX - 1 - (a % 32))
      );
    case 'negative_zero':
      return validCase(seed, sequence, category, 'negative_zero', '-0');
    case 'ascii_string': {
      const length = ordinal % 4 === 0 ? 64 : 1 + (a % 24);
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._- ';
      let text = '';
      let state = b;
      for (let index = 0; index < length; index += 1) {
        state = xorshift32(state);
        text += alphabet[state % alphabet.length];
      }
      return validCase(seed, sequence, category, 'ascii_string', text);
    }
    case 'empty_array':
      return validCase(seed, sequence, category, 'scalar_array', '');
    case 'mixed_array': {
      const width = 3 + (a % 8);
      const tokens = [];
      let state = b;
      for (let index = 0; index < width; index += 1) {
        state = xorshift32(state);
        tokens.push(scalarToken(state, index));
      }
      return validCase(seed, sequence, category, 'scalar_array', tokens.join(','));
    }
    case 'negative_zero_array': {
      const layouts = [
        ['z', 'i:1', 'b:false'],
        ['i:1', 'z', 'b:false'],
        ['i:1', 'b:false', 'z']
      ];
      return validCase(seed, sequence, category, 'scalar_array', layouts[ordinal % 3].join(','));
    }
    case 'empty_object':
      return validCase(seed, sequence, category, 'ascii_key_object', '');
    case 'single_object':
      return validCase(
        seed,
        sequence,
        category,
        'ascii_key_object',
        `k${a.toString(16)}=${scalarToken(b, ordinal)}`
      );
    case 'unordered_object': {
      const suffix = (a % 1000).toString().padStart(3, '0');
      return validCase(
        seed,
        sequence,
        category,
        'ascii_key_object',
        `z${suffix}=i:${b % 17};a${suffix}=n;m${suffix}=z;b${suffix}=b:true`
      );
    }
    case 'adjacent_prefix_keys': {
      const suffix = (a % 1000).toString().padStart(3, '0');
      return validCase(
        seed,
        sequence,
        category,
        'ascii_key_object',
        `key${suffix}a=i:2;key${suffix}=i:1;key${suffix}aa=i:3`
      );
    }
    default:
      throw new TypeError(`Unsupported valid category: ${category}`);
  }
}

export function generateValidCases(seed) {
  const next = stateCursor(seed);
  const cases = [];
  let sequence = 0;

  for (const category of VALID_BASE_CATEGORIES) {
    for (let ordinal = 0; ordinal < 14; ordinal += 1) {
      cases.push(makeValidCase(seed, sequence, category, ordinal, next));
      sequence += 1;
    }
  }

  for (let ordinal = 14; ordinal < 21; ordinal += 1) {
    cases.push(makeValidCase(seed, sequence, 'mixed_array', ordinal, next));
    sequence += 1;
  }
  for (let ordinal = 14; ordinal < 21; ordinal += 1) {
    cases.push(makeValidCase(seed, sequence, 'unordered_object', ordinal, next));
    sequence += 1;
  }

  for (let pair = 0; pair < 16; pair += 1) {
    const a = next();
    const b = next();
    const suffix = (a % 1000).toString().padStart(3, '0');
    const members = [
      [`z${suffix}`, `i:${b % 29}`],
      [`a${suffix}`, 'n'],
      [`m${suffix}`, 'z'],
      [`b${suffix}`, 'b:false']
    ];
    const group = `adv_${seedHex(seed)}_perm_${String(pair).padStart(3, '0')}`;
    const payloadA = members.map(([key, value]) => `${key}=${value}`).join(';');
    const payloadB = [...members].reverse().map(([key, value]) => `${key}=${value}`).join(';');
    cases.push({
      caseId: `${group}_a`,
      category: 'object_permutation',
      kind: 'ascii_key_object',
      payload: payloadA,
      permutationGroup: group
    });
    cases.push({
      caseId: `${group}_b`,
      category: 'object_permutation',
      kind: 'ascii_key_object',
      payload: payloadB,
      permutationGroup: group
    });
    sequence += 2;
  }

  if (cases.length !== VALID_CASES_PER_SEED) {
    throw new TypeError(`Stage 4 valid schedule drifted: ${cases.length}`);
  }
  return cases;
}

function invalidCase(seed, category, ordinal, row) {
  return {
    caseId: `adv_invalid_${seedHex(seed)}_${category}_${String(ordinal).padStart(2, '0')}`,
    category,
    row
  };
}

function invalidRow(seed, category, ordinal, next) {
  const id = `bad_${seedHex(seed)}_${category}_${ordinal}`;
  const value = next();
  switch (category) {
    case 'unknown_kind': return `${id}\tunknown_kind\t${value}`;
    case 'duplicate_case_id': return `${id}\tbool\ttrue\n${id}\tbool\tfalse`;
    case 'invalid_boolean': return `${id}\tbool\tmaybe`;
    case 'integer_above_max': return `${id}\tsafe_integer\t9007199254740992`;
    case 'integer_below_min': return `${id}\tsafe_integer\t-9007199254740992`;
    case 'invalid_negative_zero': return `${id}\tnegative_zero\t0`;
    case 'excluded_string_character': return `${id}\tascii_string\tbad${ordinal % 2 === 0 ? '"' : '\\'}value`;
    case 'malformed_array_token': return `${id}\tscalar_array\ti:1,nope,b:true`;
    case 'nested_token': return `${id}\tscalar_array\t[n]`;
    case 'invalid_object_key': return `${id}\tascii_key_object\tbad key=i:1`;
    case 'duplicate_object_key': return `${id}\tascii_key_object\ta=i:1;a=i:2`;
    case 'wrong_tsv_columns': return ordinal % 2 === 0 ? `${id}\tbool` : `${id}\tbool\ttrue\textra`;
    case 'payload_over_limit': return `${id}\tascii_string\t${'x'.repeat(4097)}`;
    case 'array_over_limit': return `${id}\tscalar_array\t${Array.from({ length: 33 }, () => 'n').join(',')}`;
    case 'object_over_limit': return `${id}\tascii_key_object\t${Array.from({ length: 33 }, (_, index) => `k${index}=n`).join(';')}`;
    case 'key_over_limit': return `${id}\tascii_key_object\t${'k'.repeat(65)}=n`;
    default: throw new TypeError(`Unsupported invalid category: ${category}`);
  }
}

export function generateInvalidCases(seed) {
  const next = stateCursor(seed ^ 0xA5A5A5A5);
  const cases = [];
  for (const category of INVALID_CATEGORIES) {
    for (let ordinal = 0; ordinal < 4; ordinal += 1) {
      cases.push(invalidCase(seed, category, ordinal, invalidRow(seed, category, ordinal, next)));
    }
  }
  if (cases.length !== INVALID_CASES_PER_SEED) {
    throw new TypeError(`Stage 4 invalid schedule drifted: ${cases.length}`);
  }
  return cases;
}

function assertUniqueCaseIds(cases) {
  const seen = new Set();
  for (const entry of cases) {
    if (!entry.caseId || seen.has(entry.caseId)) {
      throw new TypeError(`Duplicate or empty generated case_id: ${entry.caseId}`);
    }
    seen.add(entry.caseId);
  }
}

export function renderValidFixture(cases) {
  assertUniqueCaseIds(cases);
  const rows = cases.map(entry => `${entry.caseId}\t${entry.kind}\t${entry.payload}`);
  return `case_id\tkind\tpayload\n${rows.join('\n')}\n`;
}

function escapeInvalidRow(row) {
  return row.replaceAll('\\', '\\\\').replaceAll('\t', '\\t').replaceAll('\n', '\\n');
}

export function renderInvalidFixture(cases) {
  assertUniqueCaseIds(cases);
  const rows = cases.map(entry => `${entry.caseId}\t${escapeInvalidRow(entry.row)}`);
  return `case_id\tencoded_row\n${rows.join('\n')}\n`;
}

function allValidCases() {
  return FIXED_SEEDS.flatMap(generateValidCases);
}

function allInvalidCases() {
  return FIXED_SEEDS.flatMap(generateInvalidCases);
}

function main() {
  const mode = process.argv[2];
  if (mode === 'valid') {
    process.stdout.write(renderValidFixture(allValidCases()));
    return;
  }
  if (mode === 'invalid') {
    process.stdout.write(renderInvalidFixture(allInvalidCases()));
    return;
  }
  throw new TypeError('Usage: canonical_adversarial_corpus.mjs <valid|invalid>');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
