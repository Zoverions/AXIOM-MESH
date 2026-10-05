// mesh/test/praxis-lsp-v0.test.mjs
//
// Integration tests for the minimal stdio LSP server (labs/praxis/lsp.mjs).
// The server is driven with Content-Length-framed JSON-RPC over its stdin,
// and its notifications/responses are parsed back off stdout.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { diagnosticsFor, errorToDiagnostic } from '../../labs/praxis/lsp.mjs';

const lspPath = fileURLToPath(new URL('../../labs/praxis/lsp.mjs', import.meta.url));

function frame(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8'),
    body
  ]);
}

function parseFrames(text) {
  const messages = [];
  let rest = text;
  for (;;) {
    const headerEnd = rest.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const match = /Content-Length: (\d+)/i.exec(rest.slice(0, headerEnd));
    if (!match) break;
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const body = rest.slice(bodyStart, bodyStart + length);
    if (body.length < length) break;
    messages.push(JSON.parse(body));
    rest = rest.slice(bodyStart + length);
  }
  return messages;
}

function runLsp(messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [lspPath], { encoding: 'utf8' });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', () => { /* LSP logs are noise here */ });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, messages: parseFrames(out) }));
    for (const message of messages) child.stdin.write(frame(message));
    child.stdin.end();
  });
}

const GOOD = 'observe x = 1 from "p";\n';
const BAD = 'bogus !!!\n';

test('unit: diagnosticsFor is empty for a clean document', () => {
  assert.deepEqual(diagnosticsFor(GOOD), []);
});

test('unit: errorToDiagnostic maps the "at L:C" suffix to a 0-based range', () => {
  const [diagnostic] = diagnosticsFor(BAD);
  assert.equal(diagnostic.severity, 1);
  assert.equal(diagnostic.code, 'PRAXIS_SYNTAX_ERROR');
  assert.equal(diagnostic.source, 'praxis');
  assert.deepEqual(diagnostic.range, {
    start: { line: 0, character: 6 },
    end: { line: 0, character: 7 }
  });
  assert.match(diagnostic.message, /at 1:7$/);
});

test('unit: errorToDiagnostic falls back to document start without a position', () => {
  const diagnostic = errorToDiagnostic({ code: 'X', message: 'vague' });
  assert.deepEqual(diagnostic.range.start, { line: 0, character: 0 });
});

test('lsp: initialize handshake advertises full text sync', async () => {
  const { code, messages } = await runLsp([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'shutdown', params: {} },
    { jsonrpc: '2.0', method: 'exit', params: {} }
  ]);
  assert.equal(code, 0);
  const init = messages.find((m) => m.id === 1);
  assert.ok(init, 'expected an initialize response');
  assert.equal(init.result.capabilities.textDocumentSync, 1);
});

test('lsp: didOpen publishes an error diagnostic for invalid source', async () => {
  const { code, messages } = await runLsp([
    { jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri: 'file:///a.prax', text: BAD } } },
    { jsonrpc: '2.0', method: 'exit', params: {} }
  ]);
  const notification = messages.find((m) => m.method === 'textDocument/publishDiagnostics');
  assert.ok(notification, 'expected a publishDiagnostics notification');
  assert.equal(notification.params.uri, 'file:///a.prax');
  assert.equal(notification.params.diagnostics.length, 1);
  assert.equal(notification.params.diagnostics[0].severity, 1);
  assert.match(notification.params.diagnostics[0].code, /PRAXIS/);
  // exit without shutdown is a protocol violation -> non-zero exit
  assert.notEqual(code, 0);
});

test('lsp: didChange to clean source clears diagnostics', async () => {
  const { messages } = await runLsp([
    { jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri: 'file:///a.prax', text: BAD } } },
    {
      jsonrpc: '2.0',
      method: 'textDocument/didChange',
      params: { textDocument: { uri: 'file:///a.prax' }, contentChanges: [{ text: GOOD }] }
    },
    { jsonrpc: '2.0', method: 'exit', params: {} }
  ]);
  const notifications = messages.filter((m) => m.method === 'textDocument/publishDiagnostics');
  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].params.diagnostics.length, 1);
  assert.deepEqual(notifications[1].params.diagnostics, []);
});
