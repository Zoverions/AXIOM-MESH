// Boundary scan for the release verifier's and install session's module graph
// (#1903, #1914, #1916). One implementation, shared by
// test/install-release-manifest.test.mjs and test/install-session.test.mjs.
//
// AMBIENT_OR_DYNAMIC_CODE runs on the raw text (strings and comments
// included, so it is deliberately over-strict): no ambient process or global
// object, no dynamic import or require, and no dynamic code (the Function
// constructor, eval, or a constructor reached through a member such as
// (()=>{}).constructor(...)). A class's own constructor(...) method
// definition is not a member access and stays allowed.
//
// HOST_GLOBAL runs on the code-only view (comments and string, template and
// regular-expression literal text blanked), so prose such as 'validity window'
// does not match. It forbids a bare reference to a host global that is not a
// property access: obj.window, obj?.self and a . Bun are allowed; window,
// self.postMessage and typeof Deno are not. A '.' that follows a digit (1.)
// or another '.' (...) is not treated as property access, so x1.window and an
// object-literal key named like a host global are also reported (fail closed).
//
// RAW_HOST_GLOBAL is the defense-in-depth layer: the same six names anywhere
// in the raw text, strings, comments and property access included. Callers
// enable it for every scanned module whose text is clean under it, so this
// scan is never weaker than the raw-text check it replaced (#1929 B-1).
// Computed-key tricks still pass a lexical scan, so this is defense in depth,
// not containment.
import assert from 'node:assert/strict';

export const AMBIENT_OR_DYNAMIC_CODE = Object.freeze([
  /\bprocess\b/,
  /globalThis/,
  /\bimport\s*\(/,
  /\brequire\s*\(/,
  /\bFunction\b/,
  /\beval\b/,
  /\.\s*constructor\b/,
  /\[\s*['"`]constructor['"`]\s*\]/
]);

export const HOST_GLOBALS = Object.freeze(['navigator', 'self', 'window', 'Deno', 'Bun', 'WebAssembly']);

export const HOST_GLOBAL = new RegExp(
  // A single '.' (optionally spaced, so also '?.') before the name is a
  // property access; a spread '...' or a numeric literal's dot (1.) is not.
  `(?<!(?<![.\\d])\\.\\s*)(?<![\\w$#])(?:${HOST_GLOBALS.join('|')})(?![\\w$])`
);

export const RAW_HOST_GLOBAL = new RegExp(`\\b(?:${HOST_GLOBALS.join('|')})\\b`);

// Regex-versus-division. A '/' starts a regular expression after a punctuator
// in REGEX_AFTER_PUNCTUATOR or a reserved word in REGEX_AFTER_KEYWORD (not used
// as a property name, obj.return), where the grammar rules out division. It is
// division, read as code, where the grammar rules out a regular expression:
// after an identifier, number, string or template, ']', a postfix '++'/'--' or
// obj.return. It is ambiguous after ')', '}' and the contextual words in
// AMBIGUOUS_WORDS (if(x) /re/, a block then /re/, await /re/, of /re/,
// yield /re/). An ambiguous '/' is read as division only when nothing on the
// rest of its line could open a literal or comment under the wrong reading (no
// later '/', quote or backtick; a regular expression always closes on its own
// line); otherwise the scan throws. So the guarantee is: every byte is either
// classified as the grammar allows or the scan fails, and a misread can only
// over-report, never hide code.
const REGEX_AFTER_KEYWORD = new Set([
  'return', 'typeof', 'case', 'do', 'else', 'in', 'new', 'delete', 'void',
  'throw', 'instanceof'
]);
const REGEX_AFTER_PUNCTUATOR = new Set('(,=:[!&|?{;+-*%<>~^'.split(''));
const AMBIGUOUS_PUNCTUATOR = new Set([')', '}']);
const AMBIGUOUS_WORDS = new Set(['of', 'yield', 'await']);
const AMBIGUOUS_TAIL = /[/'"`]/;

// Returns `text` with every comment and every string, template and regular
// expression literal's text replaced by spaces (newlines kept), so offsets and
// line numbers are unchanged. Template ${...} expressions stay code. Input it
// cannot tokenize (an unterminated literal or comment) throws, so the scan
// fails closed instead of skipping code.
export function codeOnly(text) {
  if (typeof text !== 'string') throw new TypeError('codeOnly expects a string');
  const out = [];
  const blank = char => (char === '\n' ? '\n' : ' ');
  // Each entry is the open-brace depth of a template ${...} expression.
  const templates = [];
  let index = 0;
  let previous = '';
  let word = '';
  let gap = false;
  let wordAfterDot = false;
  let doubled = false;
  const fail = what => { throw new SyntaxError(`ambient-code scan cannot tokenize: unterminated ${what} at ${index}`); };
  const ambiguousSlash = () => AMBIGUOUS_PUNCTUATOR.has(previous)
    || (AMBIGUOUS_WORDS.has(word) && !wordAfterDot);
  const regexAllowed = () => previous === ''
    || (REGEX_AFTER_PUNCTUATOR.has(previous) && !((previous === '+' || previous === '-') && doubled))
    || (REGEX_AFTER_KEYWORD.has(word) && !wordAfterDot);
  const quoted = quote => {
    out.push(quote);
    index += 1;
    while (true) {
      if (index >= text.length) fail('string');
      const char = text[index];
      if (char === '\\') { out.push(' ', blank(text[index + 1] ?? '')); index += 2; continue; }
      if (char === quote) { out.push(quote); index += 1; return; }
      if (char === '\n') fail('string');
      out.push(blank(char));
      index += 1;
    }
  };
  // Scans template text from the current index; returns at the closing
  // backtick or after an opening ${ (pushing its brace depth).
  const templateText = () => {
    while (true) {
      if (index >= text.length) fail('template');
      const char = text[index];
      if (char === '\\') { out.push(' ', blank(text[index + 1] ?? '')); index += 2; continue; }
      if (char === '`') { out.push('`'); index += 1; return; }
      if (char === '$' && text[index + 1] === '{') { out.push('${'); index += 2; templates.push(0); return; }
      out.push(blank(char));
      index += 1;
    }
  };
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') { out.push(' '); index += 1; }
      continue;
    }
    if (char === '/' && next === '*') {
      const end = text.indexOf('*/', index + 2);
      if (end < 0) fail('comment');
      for (; index < end + 2; index += 1) out.push(blank(text[index]));
      continue;
    }
    if (char === '\'' || char === '"') { quoted(char); previous = 'literal'; word = ''; gap = false; continue; }
    if (char === '`') { out.push('`'); index += 1; templateText(); previous = text[index - 1] === '{' ? '{' : 'literal'; word = ''; gap = false; continue; }
    if (char === '/' && regexAllowed()) {
      out.push('/');
      index += 1;
      let inClass = false;
      while (true) {
        if (index >= text.length || text[index] === '\n') fail('regular expression');
        const inner = text[index];
        if (inner === '\\') { out.push('  '); index += 2; continue; }
        if (inner === '[') inClass = true;
        else if (inner === ']') inClass = false;
        else if (inner === '/' && !inClass) break;
        out.push(' ');
        index += 1;
      }
      out.push('/');
      index += 1;
      while (index < text.length && /[a-z]/i.test(text[index])) { out.push(text[index]); index += 1; }
      previous = 'literal';
      word = '';
      gap = false;
      continue;
    }
    if (char === '/' && ambiguousSlash()) {
      const lineEnd = text.indexOf('\n', index + 1);
      const tail = text.slice(index + 1, lineEnd < 0 ? text.length : lineEnd);
      if (AMBIGUOUS_TAIL.test(tail)) {
        throw new SyntaxError(`ambient-code scan cannot tokenize: ambiguous '/' (regular expression or division) at ${index}`);
      }
    }
    if (templates.length) {
      if (char === '{') templates[templates.length - 1] += 1;
      if (char === '}') {
        if (templates[templates.length - 1] === 0) {
          templates.pop();
          out.push('}');
          index += 1;
          templateText();
          previous = text[index - 1] === '{' ? '{' : 'literal';
          word = '';
          gap = false;
          continue;
        }
        templates[templates.length - 1] -= 1;
      }
    }
    out.push(char);
    index += 1;
    if (/\s/.test(char)) { gap = true; continue; }
    if (/[\w$]/.test(char)) {
      if (!gap && /^[\w$]$/.test(previous)) word += char;
      else { wordAfterDot = previous === '.'; word = char; }
      doubled = false;
    } else {
      // '++' or '--' with no gap: a postfix or prefix update, never followed
      // by a regular expression.
      doubled = !gap && previous === char && (char === '+' || char === '-') && !doubled;
      word = '';
    }
    previous = char;
    gap = false;
  }
  if (templates.length) fail('template expression');
  return out.join('');
}

// `rawHostGlobals` adds RAW_HOST_GLOBAL on the raw text. It is on by default;
// a caller turns it off only for a module whose literal text names a host
// global (install-release-manifest.mjs: 'validity window').
export function assertNoAmbientOrDynamicCode(text, name, { rawHostGlobals = true } = {}) {
  for (const pattern of AMBIENT_OR_DYNAMIC_CODE) {
    assert.doesNotMatch(text, pattern, `${name}: ${pattern}`);
  }
  if (rawHostGlobals) assert.doesNotMatch(text, RAW_HOST_GLOBAL, `${name}: host global in raw text (${HOST_GLOBALS.join(', ')})`);
  const code = codeOnly(text);
  // Literal escapes are blanked, so a backslash left in code is an identifier
  // escape (\u0077indow is window, \u0070rocess is process): rejected outright
  // so no pattern here can be bypassed by spelling.
  assert.doesNotMatch(code, /\\/, `${name}: identifier escape in code`);
  assert.doesNotMatch(code, HOST_GLOBAL, `${name}: bare host global (${HOST_GLOBALS.join(', ')})`);
}
