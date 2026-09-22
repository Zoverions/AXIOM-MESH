// labs/praxis/repl.mjs
//
// Interactive Praxis laboratory REPL: `node cli.mjs repl`.
//
// Multi-line rule (explicit, documented in :help): type your program across
// as many lines as you like; press Enter on a BLANK LINE to submit the
// buffered text for checking. A dot-command on its own line is handled
// immediately. EOF submits any buffered text, then exits.
//
// Per submission the REPL runs check (compile): on success it prints the
// canonical form of the source via format.mjs plus the pretty-printed IR;
// on failure it prints the check errors. Nothing is executed, authorized,
// or mutated -- this is the inert laboratory, same as `check`.
//
// Small by design: no history persistence, no syntax highlighting.

import { createInterface } from 'node:readline';
import { compile } from './index.mjs';
import { format } from './format.mjs';

export const REPL_PROMPT = 'praxis> ';
export const REPL_CONTINUATION_PROMPT = '......> ';

export const REPL_HELP = `praxis repl -- interactive Praxis laboratory
Multi-line rule: a blank line submits the buffered text for checking.
Type your program across as many lines as you like, then press Enter on
an empty line. Dot-commands act immediately:
  :help   show this help
  :quit   exit the repl
  :reset  discard the buffered submission
  :ir     toggle full IR printing on success (default: on)
On success the submission is compiled and shown in canonical form
(via format.mjs), then the IR is pretty-printed. On failure the check
errors are printed. Piped stdin works for scripting; EOF submits first.`;

export function evaluateSubmission(source, { showIr = true } = {}) {
  const lines = [];
  try {
    const ir = compile(source);
    lines.push(format(source));
    if (showIr) {
      lines.push(JSON.stringify(ir, null, 2));
    } else {
      lines.push(JSON.stringify({
        ok: true,
        schema: ir.schema,
        instructions: ir.instructions.length,
        required_permits: ir.required_permits
      }));
    }
    return { ok: true, output: lines.join('\n') + '\n' };
  } catch (error) {
    return {
      ok: false,
      output: `error: ${error.code ?? 'PRAXIS_ERROR'}: ${error.message}\n`
    };
  }
}

export function handleDotCommand(line, state) {
  const [cmd, ...args] = line.trim().split(/\s+/);
  switch (cmd) {
    case ':help':
      state.output.write(REPL_HELP + '\n');
      return 'help';
    case ':quit':
      return 'quit';
    case ':reset':
      state.buffer = [];
      state.output.write('(buffer cleared)\n');
      return 'reset';
    case ':ir': {
      const arg = (args[0] ?? '').toLowerCase();
      if (arg === 'on') state.showIr = true;
      else if (arg === 'off') state.showIr = false;
      else state.showIr = !state.showIr;
      state.output.write(`IR printing: ${state.showIr ? 'on' : 'off'}\n`);
      return 'ir';
    }
    default:
      state.output.write(`unknown command ${cmd}; try :help\n`);
      return 'unknown';
  }
}

export async function runRepl({ input = process.stdin, output = process.stdout } = {}) {
  const state = { input, output, buffer: [], showIr: true };
  const rl = createInterface({ input, output, prompt: REPL_PROMPT });
  rl.prompt();

  // Flushes any buffered submission. Idempotent: a second call is a no-op.
  const flushBuffer = () => {
    if (state.buffer.length > 0) {
      const { output: text } = evaluateSubmission(state.buffer.join('\n') + '\n', state);
      state.output.write(text);
      state.buffer = [];
    }
  };

  const close = () => {
    rl.close(); // the 'close' event below flushes the buffer, then exits
  };

  rl.on('line', (raw) => {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith(':')) {
      if (handleDotCommand(line, state) === 'quit') {
        close();
        return;
      }
      rl.setPrompt(state.buffer.length > 0 ? REPL_CONTINUATION_PROMPT : REPL_PROMPT);
      rl.prompt();
      return;
    }
    if (line.trim() === '') {
      // Blank line = submit, per the multi-line rule. A blank line on an
      // empty buffer is a no-op (just re-prompt).
      if (state.buffer.length > 0) {
        const { output: text } = evaluateSubmission(state.buffer.join('\n') + '\n', state);
        state.output.write(text);
        state.buffer = [];
      }
      rl.setPrompt(REPL_PROMPT);
      rl.prompt();
      return;
    }
    state.buffer.push(line);
    rl.setPrompt(REPL_CONTINUATION_PROMPT);
    rl.prompt();
  });

  rl.on('close', () => {
    // :quit, EOF, or SIGINT with buffered text: submit it first,
    // per the documented rule, then let the runRepl promise resolve.
    flushBuffer();
  });
  rl.on('SIGINT', () => { rl.close(); });

  await new Promise((resolve) => rl.on('close', resolve));
  return 0;
}
