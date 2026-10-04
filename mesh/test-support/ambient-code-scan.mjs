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
// self.postMessage and typeof Deno are not. An object-literal key named like a
// host global is also reported (fail closed). Computed-key tricks still pass a
// lexical scan, so this is defense in depth, not containment.
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
  // property access; a spread '...' is not.
  `(?<!(?<!\\.)\\.\\s*)(?<![\\w$#])(?:${HOST_GLOBALS.join('|')})(?![\\w$])`
);

const REGEX_AFTER_KEYWORD = new Set([
  'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'instanceof', 'yield', 'await'
]);
const REGEX_AFTER_PUNCTUATOR = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));

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
  const fail = what => { throw new SyntaxError(`ambient-code scan cannot tokenize: unterminated ${what} at ${index}`); };
  const regexAllowed = () => previous === '' || REGEX_AFTER_PUNCTUATOR.has(previous) || REGEX_AFTER_KEYWORD.has(word);
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
      word = !gap && /^[\w$]$/.test(previous) ? word + char : char;
    } else {
      word = '';
    }
    previous = char;
    gap = false;
  }
  if (templates.length) fail('template expression');
  return out.join('');
}

export function assertNoAmbientOrDynamicCode(text, name) {
  for (const pattern of AMBIENT_OR_DYNAMIC_CODE) {
    assert.doesNotMatch(text, pattern, `${name}: ${pattern}`);
  }
  assert.doesNotMatch(codeOnly(text), HOST_GLOBAL, `${name}: bare host global (${HOST_GLOBALS.join(', ')})`);
}
