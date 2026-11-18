// labs/praxis/lexer.mjs
//
// Praxis source lexer.
//
// Split from the former index.mjs monolith without behavior change;
// this module owns the section(s) listed above.

import { PraxisSyntaxError } from './errors.mjs';

export function lex(source) {
  if (typeof source !== 'string') throw new TypeError('Praxis source must be a string');

  const tokens = [];
  let index = 0;
  let line = 1;
  let column = 1;

  // Sticky expressions scan directly against the original source at `index`.
  // Avoiding source.slice(index) on every token prevents suffix copying from
  // turning otherwise linear lexing into input-size-sensitive superlinear work.
  const whitespacePattern = /[\s]+/y;
  const commentPattern = /(?:\/\/|#)[^\n]*/y;
  const stringPattern = /"(?:\\.|[^"\\])*"/y;
  const numberPattern = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?/y;
  const wordPattern = /[A-Za-z_][A-Za-z0-9_.-]*/y;

  const matchAtIndex = (pattern) => {
    pattern.lastIndex = index;
    // Invoke only the built-in RegExp matcher against the in-memory source;
    // keep the transport-boundary sentinel unchanged rather than widening it.
    return Reflect.apply(RegExp.prototype.exec, pattern, [source]);
  };

  const advance = (text) => {
    for (const char of text) {
      if (char === '\n') {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
    }
    index += text.length;
  };

  while (index < source.length) {
    const whitespace = matchAtIndex(whitespacePattern);
    if (whitespace) {
      advance(whitespace[0]);
      continue;
    }

    const comment = matchAtIndex(commentPattern);
    if (comment) {
      advance(comment[0]);
      continue;
    }

    const tokenLine = line;
    const tokenColumn = column;

    const stringMatch = matchAtIndex(stringPattern);
    if (stringMatch) {
      let value;
      try {
        value = JSON.parse(stringMatch[0]);
      } catch {
        throw new PraxisSyntaxError('invalid string literal', {
          line: tokenLine,
          column: tokenColumn
        });
      }
      tokens.push({ type: 'string', value, line: tokenLine, column: tokenColumn });
      advance(stringMatch[0]);
      continue;
    }

    const numberMatch = matchAtIndex(numberPattern);
    if (numberMatch) {
      tokens.push({
        type: 'number',
        value: Number(numberMatch[0]),
        line: tokenLine,
        column: tokenColumn
      });
      advance(numberMatch[0]);
      continue;
    }

    const wordMatch = matchAtIndex(wordPattern);
    if (wordMatch) {
      tokens.push({ type: 'word', value: wordMatch[0], line: tokenLine, column: tokenColumn });
      advance(wordMatch[0]);
      continue;
    }

    const punct = source[index];
    if (':@;=(),'.includes(punct)) {
      tokens.push({ type: punct, value: punct, line: tokenLine, column: tokenColumn });
      advance(punct);
      continue;
    }

    throw new PraxisSyntaxError(`unexpected character ${JSON.stringify(source[index])}`, {
      line: tokenLine,
      column: tokenColumn
    });
  }

  tokens.push({ type: 'eof', value: null, line, column });
  return tokens;
}
