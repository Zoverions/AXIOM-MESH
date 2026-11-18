// labs/praxis/fuzz.mjs
//
// Seeded grammar-aware program generator and mutator for Praxis source.
//
// Purpose: feed the lexer/parser/formatter adversarial and large inputs in a
// deterministic way (no Math.random; every run with the same seed produces the
// same corpus). The generator emits syntactically valid programs; the mutator
// derives near-valid variants to probe fail-closed behavior.
//
// The invariant under test lives in mesh/test/praxis-fuzz-v0.test.mjs:
//   - lex/parse of any string input throws only PraxisSyntaxError
//     (never TypeError, RangeError, stack overflow, or a hang)
//   - compile of any string input throws only PraxisSyntaxError/PraxisTypeError
//   - format(parse(x)) re-parses to a deep-equal AST for valid x
//
// This module is pure: no I/O, no network, no randomness source beyond the
// explicit seed. Safe for the interpreter transport-surface conformance scan.

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACTIONS = ['Deploy', 'Release', 'Backup', 'Rotate', 'Attest', 'Publish'];
const SCOPES = ['Production', 'Staging', 'Edge', 'Vault'];
const KINDS = ['permit', 'lease', 'quorum', 'secret', 'prepared'];
const IDENT_PARTS = ['alpha', 'beta', 'gamma', 'delta', 'node', 'svc', 'key', 'op', 'q'];

export function createGenerator(seed) {
  const rand = mulberry32(seed);
  let counter = 0;

  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

  function identifier() {
    counter += 1;
    let name = pick(IDENT_PARTS) + '_' + counter;
    // Occasionally exercise the dotted/dashed identifier tail the lexer allows.
    const r = rand();
    if (r < 0.15) name += '.v' + int(1, 9);
    else if (r < 0.25) name += '-edge';
    return name;
  }

  function action() {
    return pick(ACTIONS);
  }

  function scope() {
    return pick(SCOPES);
  }

  function stringLiteral() {
    const r = rand();
    if (r < 0.2) return JSON.stringify('sha256:' + int(1000, 9999) + 'x'.repeat(int(0, 40)));
    if (r < 0.3) return JSON.stringify('weird "quoted" \\ backslash \u00e9\ud83d\ude00');
    if (r < 0.35) return JSON.stringify('');
    return JSON.stringify(pick(['git:main', 'ci:build-42', 'src-' + int(1, 99), 's3://bucket/key']));
  }

  function numberLiteral() {
    const r = rand();
    if (r < 0.1) return '-' + int(0, 999999);
    if (r < 0.2) return int(0, 999999) + '.' + int(0, 999999);
    if (r < 0.25) return '9007199254740993'; // > Number.MAX_SAFE_INTEGER, still lexable
    return String(int(0, 9999));
  }

  function literalOrRef(names) {
    const r = rand();
    if (r < 0.3 && names.length > 0) return pick(names);
    if (r < 0.5) return stringLiteral();
    if (r < 0.65) return numberLiteral();
    if (r < 0.75) return rand() < 0.5 ? 'true' : 'false';
    return identifier();
  }

  function requiresStmt(names) {
    const kind = pick(KINDS);
    const name = identifier();
    names.push(name);
    if (kind === 'secret') return `requires secret ${name}: ${identifier()};`;
    if (kind === 'prepared') return `requires prepared ${name}: ${action()} @ ${scope()};`;
    if (kind === 'quorum') {
      const members = [];
      const n = int(1, 4);
      for (let i = 0; i < n; i++) members.push(identifier());
      return `requires quorum ${name}: ${action()} @ ${scope()} threshold ${int(1, n)} of ${members.join(', ')};`;
    }
    return `requires ${kind} ${name}: ${action()} @ ${scope()};`;
  }

  function observeStmt(names) {
    const name = identifier();
    names.push(name);
    return `observe ${name} = ${literalOrRef(names)} from ${stringLiteral()};`;
  }

  function verifyStmt(names) {
    const name = identifier();
    names.push(name);
    const input = names.length > 1 && rand() < 0.7 ? pick(names) : identifier();
    return `verify ${name} = ${input} with ${identifier()};`;
  }

  function assessStmt(names) {
    const name = identifier();
    names.push(name);
    const input = names.length > 1 && rand() < 0.7 ? pick(names) : identifier();
    return `assess ${name} = ${input} with ${identifier()};`;
  }

  function opStmt(names) {
    const name = identifier();
    names.push(name);
    const args = [];
    const nArgs = int(0, 3);
    for (let i = 0; i < nArgs; i++) args.push(literalOrRef(names));
    let stmt = `op ${name} = ${action()}(${args.join(', ')}) @ ${scope()}`;
    // Modifiers in random order, each at most once; irreversible/egress need effect.
    const mods = [];
    if (rand() < 0.5) mods.push('effect');
    if (rand() < 0.25) mods.push('irreversible');
    if (rand() < 0.25) mods.push('egress');
    if (rand() < 0.3) mods.push('secrets');
    if ((mods.includes('irreversible') || mods.includes('egress')) && !mods.includes('effect')) {
      mods.push('effect');
    }
    // Shuffle.
    for (let i = mods.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [mods[i], mods[j]] = [mods[j], mods[i]];
    }
    for (const mod of mods) {
      if (mod === 'effect') stmt += ` effect ${identifier()}`;
      else if (mod === 'irreversible') stmt += ' irreversible';
      else if (mod === 'egress') stmt += ` egress ${stringLiteral()}`;
      else if (mod === 'secrets') {
        const ss = [];
        const n = int(1, 3);
        for (let i = 0; i < n; i++) ss.push(identifier());
        stmt += ` using secrets ${ss.join(', ')}`;
      }
    }
    return stmt + ';';
  }

  function lifecycleStmt(names, keyword) {
    const name = identifier();
    names.push(name);
    const target = names.length > 1 && rand() < 0.7 ? pick(names) : identifier();
    if (keyword === 'authorize') {
      const permit = names.length > 1 && rand() < 0.7 ? pick(names) : identifier();
      return `authorize ${target} using ${permit} as ${name};`;
    }
    return `${keyword} ${target} as ${name};`;
  }

  const STATEMENT_BUILDERS = [
    requiresStmt,
    observeStmt,
    verifyStmt,
    assessStmt,
    opStmt,
    (names) => lifecycleStmt(names, 'authorize'),
    (names) => lifecycleStmt(names, 'prepare'),
    (names) => lifecycleStmt(names, 'cancel'),
    (names) => lifecycleStmt(names, 'commit'),
    (names) => lifecycleStmt(names, 'finalize')
  ];

  function statement(names) {
    return pick(STATEMENT_BUILDERS)(names);
  }

  function program(statementCount) {
    const names = [];
    const lines = [];
    for (let i = 0; i < statementCount; i++) {
      // Sprinkle comments (the lexer must discard them) and blank lines.
      const r = rand();
      if (r < 0.08) lines.push('// fuzz comment ' + int(0, 9999));
      else if (r < 0.12) lines.push('# hash comment');
      else if (r < 0.15) lines.push('');
      lines.push(statement(names));
    }
    return lines.join('\n') + '\n';
  }

  // Token/character-level mutations of a valid source, for fail-closed probing.
  function mutate(source, mutationCount) {
    const PUNCT = [':', '@', ';', '=', '(', ')', ',', '"', ' ', '\n'];
    let chars = source.split('');
    for (let i = 0; i < mutationCount; i++) {
      if (chars.length === 0) break;
      const r = rand();
      const pos = Math.floor(rand() * chars.length);
      if (r < 0.35) {
        chars.splice(pos, 1); // deletion
      } else if (r < 0.55) {
        chars.splice(pos, 0, pick(PUNCT)); // insertion
      } else if (r < 0.75) {
        chars[pos] = pick(PUNCT); // replacement
      } else if (r < 0.9 && pos + 1 < chars.length) {
        [chars[pos], chars[pos + 1]] = [chars[pos + 1], chars[pos]]; // swap
      } else {
        chars.splice(pos, 0, chars[pos]); // duplication
      }
    }
    return chars.join('');
  }

  return { identifier, program, statement, mutate, names: () => [], rand };
}

// Adversarial one-off inputs that historically break hand-rolled lexers.
export function adversarialInputs() {
  return [
    '',
    ' ',
    '\n\n\n',
    ';',
    'op',
    'op = = = ;;;',
    'requires permit: @ ;',
    'observe x = "unterminated;',
    'observe x = "bad \\q escape" from "s";',
    '"lone string";',
    '12345;',
    'true false;',
    'op x = A() @ S effect;',
    'op x = A() @ S irreversible;',
    'op x = A() @ S egress "e";',
    'op x = A() @ S effect e effect e2;',
    '// ' + 'c'.repeat(100000) + '\n',
    'Op X = A() @ S;',
    'REQUIRES permit p: A @ S;',
    'observe x\u0000 = 1 from "s";',
    'observe x = 1e10 from "s";', // exponent notation is NOT lexable; must fail closed
    'observe x = 0x10 from "s";',
    'observe x = .5 from "s";',
    'observe x = 5. from "s";',
  ];
}
