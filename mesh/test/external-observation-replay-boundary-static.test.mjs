import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const replayStoreSourceUrl = new URL(
  '../src/lib/external-observation-replay-store.mjs',
  import.meta.url
);

test('durable external replay store is filesystem-only and non-authorizing', async () => {
  const source = await readFile(replayStoreSourceUrl, 'utf8');

  assert.match(
    source,
    /node:fs\/promises/,
    'durable replay store is expected to use local filesystem persistence'
  );
  assert.doesNotMatch(
    source,
    /node:(?:http|https|net|tls|dgram|child_process)/,
    'durable replay store must not import network or subprocess runtime modules'
  );
  assert.doesNotMatch(source, /\bcreateServer\s*\(/, 'durable replay store must not create a server');
  assert.doesNotMatch(source, /\.listen\s*\(/, 'durable replay store must not listen on a socket');
  assert.doesNotMatch(source, /\bfetch\s*\(/, 'durable replay store must not make fetch calls');
  assert.doesNotMatch(
    source,
    /\b(?:spawn|exec|execFile|fork)\s*\(/,
    'durable replay store must not launch subprocesses'
  );
  assert.doesNotMatch(
    source,
    /\b(?:GridStore|Gateway|Hypervisor|Sandbox)\b/,
    'durable replay store must not import or invoke privileged AXIOM runtime surfaces'
  );
  assert.doesNotMatch(
    source,
    /from ['"][^'"]*(?:credential|wallet|token|secret)[^'"]*['"]/i,
    'durable replay store must not import credential, wallet, token, or secret modules'
  );
});
