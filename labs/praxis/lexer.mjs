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
    const rest = source.slice(index);

    const whitespace = rest.match(/^[\s]+/);
    if (whitespace) {
      advance(whitespace[0]);
      continue;
    }

    const comment = rest.match(/^(?:\/\/|#)[^\n]*/);
    if (comment) {
      advance(comment[0]);
      continue;
    }

    const tokenLine = line;
    const tokenColumn = column;

    const stringMatch = rest.match(/^"(?:\\.|[^"\\])*"/);
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

    const numberMatch = rest.match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?/);
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

    const wordMatch = rest.match(/^[A-Za-z_][A-Za-z0-9_.-]*/);
    if (wordMatch) {
      tokens.push({ type: 'word', value: wordMatch[0], line: tokenLine, column: tokenColumn });
      advance(wordMatch[0]);
      continue;
    }

    const punct = rest[0];
    if (':@;=(),'.includes(punct)) {
      tokens.push({ type: punct, value: punct, line: tokenLine, column: tokenColumn });
      advance(punct);
      continue;
    }

    throw new PraxisSyntaxError(`unexpected character ${JSON.stringify(rest[0])}`, {
      line: tokenLine,
      column: tokenColumn
    });
  }

  tokens.push({ type: 'eof', value: null, line, column });
  return tokens;
}
