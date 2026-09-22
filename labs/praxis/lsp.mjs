// labs/praxis/lsp.mjs
//
// Minimal Language Server Protocol (stdio) front-end for Praxis.
//
// Speaks JSON-RPC 2.0 over stdio with Content-Length framing:
//   initialize / initialized / shutdown / exit
//   textDocument/didOpen + textDocument/didChange (full text sync)
//     -> textDocument/publishDiagnostics
//
// Diagnostics come straight from check (compile): one diagnostic per
// thrown Praxis error, mapped to an LSP range. The parser reports
// positions inside the error message ("... at L:C", 1-based); this module
// parses that suffix and converts to 0-based LSP coordinates. A failed
// position parse falls back to the start of the document.
//
// Run: node labs/praxis/lsp.mjs
//
// Not wired into cli.mjs (kept out of the merge zone); run it directly.

import { fileURLToPath } from 'node:url';
import { compile } from './index.mjs';

export function errorToDiagnostic(error) {
  const match = String(error.message).match(/ at (\d+):(\d+)$/);
  const line = match ? Number(match[1]) - 1 : 0;
  const character = match ? Number(match[2]) - 1 : 0;
  return {
    range: {
      start: { line, character },
      end: { line, character: character + 1 }
    },
    severity: 1, // Error
    code: error.code ?? 'PRAXIS_ERROR',
    source: 'praxis',
    message: String(error.message)
  };
}

export function diagnosticsFor(text) {
  try {
    compile(text);
    return [];
  } catch (error) {
    return [errorToDiagnostic(error)];
  }
}

export function startLspServer({ input = process.stdin, output = process.stdout } = {}) {
  return new Promise((resolve) => {
    let buffer = Buffer.alloc(0);
    let shuttingDown = false;

    function send(message) {
      const body = Buffer.from(JSON.stringify(message), 'utf8');
      output.write(`Content-Length: ${body.length}\r\n\r\n`);
      output.write(body);
    }

    function publishDiagnostics(uri, text) {
      send({
        jsonrpc: '2.0',
        method: 'textDocument/publishDiagnostics',
        params: { uri, diagnostics: diagnosticsFor(text) }
      });
    }

    function handle(message) {
      const { id, method, params = {} } = message;
      const respond = (result) => send({ jsonrpc: '2.0', id, result });
      switch (method) {
        case 'initialize':
          respond({ capabilities: { textDocumentSync: 1 } });
          break;
        case 'initialized':
          break;
        case 'shutdown':
          shuttingDown = true;
          respond(null);
          break;
        case 'exit':
          resolve(shuttingDown ? 0 : 1);
          break;
        case 'textDocument/didOpen': {
          const doc = params.textDocument ?? {};
          publishDiagnostics(doc.uri, doc.text ?? '');
          break;
        }
        case 'textDocument/didChange': {
          const doc = params.textDocument ?? {};
          const change = (params.contentChanges ?? [])[0] ?? {};
          publishDiagnostics(doc.uri, change.text ?? '');
          break;
        }
        default:
          if (id !== undefined) {
            send({
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Method not found: ${method}` }
            });
          }
      }
    }

    function pump() {
      for (;;) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const header = buffer.subarray(0, headerEnd).toString('utf8');
        const match = header.match(/Content-Length: (\d+)/i);
        if (!match) {
          // Unparseable framing: drop the header and keep going.
          buffer = buffer.subarray(headerEnd + 4);
          continue;
        }
        const length = Number(match[1]);
        const bodyStart = headerEnd + 4;
        if (buffer.length < bodyStart + length) return;
        const body = buffer.subarray(bodyStart, bodyStart + length).toString('utf8');
        buffer = buffer.subarray(bodyStart + length);
        try {
          handle(JSON.parse(body));
        } catch {
          // Malformed JSON is ignored per JSON-RPC: keep serving.
        }
      }
    }

    input.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      pump();
    });
    input.on('end', () => resolve(shuttingDown ? 0 : 1));
  });
}

const invokedAsMain = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedAsMain) {
  startLspServer().then((code) => process.exit(code));
}
