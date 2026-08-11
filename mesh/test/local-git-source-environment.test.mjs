import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { inspectLocalGitSource } from '../src/repository-operator/local-git-source.mjs';

const SAFE_GIT_ENV = new Set([
  'GIT_CONFIG_NOSYSTEM',
  'GIT_CONFIG_GLOBAL',
  'GIT_TERMINAL_PROMPT',
  'GIT_OPTIONAL_LOCKS',
  'GIT_NO_LAZY_FETCH'
]);

test('local Git inspection strips inherited Git control variables and invokes no network transport', async t => {
  const priorCount = process.env.GIT_CONFIG_COUNT;
  const priorKey = process.env.GIT_CONFIG_KEY_0;
  const priorValue = process.env.GIT_CONFIG_VALUE_0;
  const priorLazyFetch = process.env.GIT_NO_LAZY_FETCH;
  process.env.GIT_CONFIG_COUNT = '1';
  process.env.GIT_CONFIG_KEY_0 = 'alias.rev-parse';
  process.env.GIT_CONFIG_VALUE_0 = '!echo compromised';
  process.env.GIT_NO_LAZY_FETCH = '0';
  t.after(() => {
    if (priorCount === undefined) delete process.env.GIT_CONFIG_COUNT;
    else process.env.GIT_CONFIG_COUNT = priorCount;
    if (priorKey === undefined) delete process.env.GIT_CONFIG_KEY_0;
    else process.env.GIT_CONFIG_KEY_0 = priorKey;
    if (priorValue === undefined) delete process.env.GIT_CONFIG_VALUE_0;
    else process.env.GIT_CONFIG_VALUE_0 = priorValue;
    if (priorLazyFetch === undefined) delete process.env.GIT_NO_LAZY_FETCH;
    else process.env.GIT_NO_LAZY_FETCH = priorLazyFetch;
  });

  const calls = [];
  const execFileImpl = (command, args, options, callback) => {
    calls.push({ command, args: [...args], env: { ...options.env } });
    const operation = args[2];
    if (operation === 'rev-parse' && args.includes('--show-object-format')) {
      callback(null, Buffer.from('sha1\n'), Buffer.alloc(0));
      return;
    }
    if (operation === 'rev-parse' && args.includes('--verify')) {
      callback(null, Buffer.from(`${'a'.repeat(40)}\n`), Buffer.alloc(0));
      return;
    }
    if (operation === 'show') {
      callback(null, Buffer.from(`${'b'.repeat(40)}\n`), Buffer.alloc(0));
      return;
    }
    if (operation === 'ls-tree' || operation === 'fsck') {
      callback(null, Buffer.alloc(0), Buffer.alloc(0));
      return;
    }
    callback(new Error('unexpected Git command'), Buffer.alloc(0), Buffer.alloc(0));
  };

  const result = await inspectLocalGitSource({
    repository_path: tmpdir(),
    execFileImpl
  });
  assert.equal(result.provider_api_required, false);
  assert.equal(result.network_required, false);
  assert.equal(result.source_bytes_independently_committed, true);
  assert.equal(result.lazy_fetch_disabled, true);
  assert.equal(result.unique_blob_count, 0);
  assert.equal(result.unique_blob_bytes, 0);
  assert.equal(calls.length, 5);

  for (const call of calls) {
    assert.equal(call.command, 'git');
    assert.equal(call.args.some(arg => /https?:|github\.com|api\.github\.com/i.test(arg)), false);
    for (const key of Object.keys(call.env).filter(key => key.startsWith('GIT_'))) {
      assert.equal(SAFE_GIT_ENV.has(key), true, `unexpected inherited Git variable: ${key}`);
    }
    assert.equal(call.env.GIT_CONFIG_COUNT, undefined);
    assert.equal(call.env.GIT_CONFIG_KEY_0, undefined);
    assert.equal(call.env.GIT_CONFIG_VALUE_0, undefined);
    assert.equal(call.env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(call.env.GIT_OPTIONAL_LOCKS, '0');
    assert.equal(call.env.GIT_NO_LAZY_FETCH, '1');
  }
});
