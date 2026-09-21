import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const script = resolve(repositoryRoot, 'mcp-config-credential-check.mjs');

async function withConfig(contents, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-mcp-config-'));
  const file = join(dir, 'mcp.json');
  try {
    await writeFile(file, contents, 'utf8');
    await fn(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(file) {
  return spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
}

test('flags literal credentials without printing secret values', async () => {
  await withConfig(JSON.stringify({
    mcpServers: {
      example: {
        env: { API_TOKEN: 'super-secret-value-123' },
        headers: { Authorization: 'Bearer another-secret-value' }
      }
    }
  }), async (file) => {
    const result = run(file);
    assert.equal(result.status, 2);
    assert.match(result.stdout, /API_TOKEN/);
    assert.match(result.stdout, /Authorization/);
    assert.match(result.stdout, /value=REDACTED/);
    assert.doesNotMatch(result.stdout, /super-secret-value-123/);
    assert.doesNotMatch(result.stdout, /another-secret-value/);
  });
});

test('accepts environment, input, and secret-manager references', async () => {
  await withConfig(JSON.stringify({
    mcpServers: {
      example: {
        env: {
          API_TOKEN: '${API_TOKEN}',
          API_KEY: '${env:API_KEY}',
          PASSWORD: '${input:db_password}',
          SECRET: 'op://Private/MCP/token'
        },
        headers: { Authorization: 'Bearer ${env:MCP_TOKEN}' }
      }
    }
  }), async (file) => {
    const result = run(file);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /no hardcoded credential literals found/);
  });
});

test('fails closed on invalid JSON', async () => {
  await withConfig('{not-json', async (file) => {
    const result = run(file);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unable to read or parse JSON/);
  });
});
