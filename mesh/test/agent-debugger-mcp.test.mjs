import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIR, '..', '..');

function codexTable(text, name) {
  const marker = `[mcp_servers.${name}]`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `missing Codex MCP table: ${name}`);
  const body = text.slice(start + marker.length);
  const next = body.search(/\n\[mcp_servers\./);
  return next === -1 ? body : body.slice(0, next);
}

test('developer debugger MCP configuration is pinned, local, and least-privilege by default', async () => {
  const [genericText, codex, agents, cursorRules] = await Promise.all([
    readFile(resolve(REPOSITORY_ROOT, '.mcp.json'), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, '.codex', 'config.toml'), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, 'AGENTS.md'), 'utf8'),
    readFile(resolve(REPOSITORY_ROOT, '.cursorrules'), 'utf8')
  ]);

  const generic = JSON.parse(genericText);
  assert.deepEqual(
    Object.keys(generic.mcpServers).sort(),
    ['chrome-devtools', 'debugger']
  );

  const debuggerServer = generic.mcpServers.debugger;
  assert.equal(debuggerServer.command, 'npx');
  assert.match(
    debuggerServer.args[1],
    /^@debugmcp\/mcp-debugger@\d+\.\d+\.\d+$/
  );
  assert.equal(debuggerServer.args.at(-1), 'stdio');
  assert.equal(debuggerServer.env.DEBUG_MCP_VARIABLE_ACCESS, 'explicit');
  assert.equal(debuggerServer.env.DEBUG_MCP_BP_ADDRESSING, 'content');

  const browserServer = generic.mcpServers['chrome-devtools'];
  assert.equal(browserServer.command, 'npx');
  assert.match(
    browserServer.args[1],
    /^chrome-devtools-mcp@\d+\.\d+\.\d+$/
  );
  for (const flag of [
    '--headless=true',
    '--isolated=true',
    '--performance-crux=false',
    '--usage-statistics=false',
    '--redact-network-headers=true'
  ]) {
    assert.ok(browserServer.args.includes(flag), `missing browser hardening flag: ${flag}`);
  }
  assert.equal(
    browserServer.env.CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS,
    '1'
  );

  assert.ok(!genericText.includes('@latest'), 'debugger MCP dependencies must stay pinned');
  assert.ok(!genericText.includes('"url"'), 'developer debugger MCP config must not define remote HTTP servers');

  for (const name of ['debugger', 'chrome_devtools']) {
    const table = codexTable(codex, name);
    assert.match(table, /enabled = true/);
    assert.match(table, /required = false/);
    assert.match(table, /default_tools_approval_mode = "writes"/);
    assert.doesNotMatch(table, /url\s*=/);
    assert.doesNotMatch(table, /@latest/);
  }

  for (const rules of [agents, cursorRules]) {
    assert.match(rules, /Debugger-first diagnosis/);
    assert.match(rules, /before making a second speculative code patch/);
    assert.match(rules, /Debugger observations are evidence, not authority/);
    assert.match(rules, /Do not attach debugger tooling to production/);
  }
});
