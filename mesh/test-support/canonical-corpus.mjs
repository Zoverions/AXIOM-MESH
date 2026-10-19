// Deterministic corpus of valid canonical-JSON inputs, used by the
// canonical.mjs differential test. Generation depends only on the seed, never
// on the implementation under test, so the same corpus can be replayed against
// a pinned reference output.

function prng(seed) {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state;
  };
}

const KEY_POOL = [
  'a', 'b', 'A', 'Z', '_', '-', '0', '1', '2', '10', '01', '9007199254740993', '', ' ', 'é', 'e\u0301',
  '\u00e9', 'ß', '中', '😀', '\ud800', '\udfff', 'constructor', 'toString', 'hasOwnProperty', 'length',
  'valueOf', 'key with space', 'quote"', 'back\\slash', 'line\nbreak', 'tab\t', '\u0000', '\u2028', '\u007f'
];
const STRING_POOL = [
  '', 'plain', 'é', '中文', '😀', '\ud83d', '\ude00', '"', '\\', '/', '\b\f\n\r\t', '\u0000\u001f', '\u2028\u2029',
  '<script>', 'a'.repeat(300), ' leading', 'trailing ', '0', 'null', 'true'
];
const NUMBER_POOL = [
  0, -0, 1, -1, 0.1, 0.2, 1e21, 1e-7, -1e-7, 123456789.123, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER,
  Number.MAX_VALUE, Number.MIN_VALUE, -Number.MAX_VALUE, 2 ** 53, 1.5e300, 5e-324, 100, 1e20
];

export function canonicalCorpus(seed, count) {
  const next = prng(seed);
  const pick = items => items[next() % items.length];
  const shared = [];
  function value(depth) {
    const roll = next() % (depth > 6 ? 5 : 9);
    switch (roll) {
      case 0: return null;
      case 1: return next() % 2 === 0;
      case 2: return pick(STRING_POOL);
      case 3: return pick(NUMBER_POOL);
      case 4: return (next() % 2_000_001) - 1_000_000 + (next() % 4 === 0 ? (next() % 1000) / 1000 : 0);
      case 5: {
        const length = next() % 6;
        const out = [];
        for (let index = 0; index < length; index += 1) out.push(value(depth + 1));
        return out;
      }
      case 6: {
        if (shared.length && next() % 4 === 0) return pick(shared);
        const out = next() % 5 === 0 ? Object.create(null) : {};
        const size = next() % 6;
        for (let index = 0; index < size; index += 1) {
          Object.defineProperty(out, pick(KEY_POOL), {
            value: value(depth + 1), enumerable: true, configurable: true, writable: true
          });
        }
        shared.push(out);
        return out;
      }
      case 7: return JSON.parse(`{"__proto__":${JSON.stringify(pick(STRING_POOL))},"z":1}`);
      default: {
        const out = {};
        for (const key of [pick(KEY_POOL), pick(KEY_POOL)]) {
          Object.defineProperty(out, key, {
            value: [value(depth + 1), value(depth + 1)], enumerable: true, configurable: true, writable: true
          });
        }
        return out;
      }
    }
  }
  const corpus = [];
  for (let index = 0; index < count; index += 1) corpus.push(value(0));
  // Deep but valid chains, up to the deepest real input and the module bound.
  for (const levels of [64, 1004, 2048]) {
    let array = 1;
    let record = 'leaf';
    for (let index = 0; index < levels; index += 1) {
      array = [array];
      record = { k: record };
    }
    corpus.push(array, record);
  }
  return corpus;
}
