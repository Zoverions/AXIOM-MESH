#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { ValidationError, assertPlainObject, assertString } from './lib/canonical.mjs';
import { ensureMeshIdentity, loadTrustedKey } from './lib/identity.mjs';
import {
  readRepositoryOperatorToken,
  runGitHubRepositoryDocsOperator
} from './repository-operator/github-docs-operator.mjs';

const MAX_STDIN_BYTES = 2 * 1024 * 1024;

async function readStdinJson() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_STDIN_BYTES) throw new ValidationError('repository operator request exceeds size ceiling');
    chunks.push(chunk);
  }
  if (!chunks.length) throw new ValidationError('repository operator request is required');
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ValidationError('repository operator request must be valid JSON'); }
  const request = assertPlainObject(value, 'repository operator request');
  const unknown = Object.keys(request).filter(key => !['prepared_effect', 'grid_prepared_event'].includes(key));
  if (unknown.length) throw new ValidationError(`repository operator request contains unsupported fields: ${unknown.join(', ')}`);
  return request;
}

function requiredEnv(name) {
  return assertString(process.env[name], name, { min: 1, max: 4096 });
}

async function main() {
  // No API-origin override is accepted by this production executable.
  if (process.env.AXIOM_REPOSITORY_OPERATOR_GITHUB_ORIGIN) {
    throw new ValidationError('production repository operator does not permit GitHub API origin override');
  }
  const dataDir = requiredEnv('AXIOM_DATA_DIR');
  const tokenFile = requiredEnv('AXIOM_REPOSITORY_OPERATOR_TOKEN_FILE');
  const request = await readStdinJson();

  // All production trust material is file-backed and must already exist.
  const [operatorIdentity, hypervisorPublicKey, gridPublicKey, token] = await Promise.all([
    ensureMeshIdentity(dataDir, 'repository-operator', { create: false }),
    loadTrustedKey(dataDir, 'hypervisor'),
    loadTrustedKey(dataDir, 'grid'),
    readRepositoryOperatorToken(tokenFile)
  ]);

  const result = await runGitHubRepositoryDocsOperator({
    prepared_effect: request.prepared_effect,
    grid_prepared_event: request.grid_prepared_event,
    operatorIdentity,
    hypervisorPublicKey,
    gridPublicKey,
    token
  });
  process.stdout.write(`${JSON.stringify(result.receipt)}\n`);
}

main().catch(error => {
  const code = typeof error?.code === 'string' ? error.code : 'repository_operator_failed';
  const message = typeof error?.message === 'string' && error.message.length <= 240
    ? error.message
    : 'Repository operator failed';
  // Deliberately omit arbitrary details, stack traces, request bodies, and filesystem contents.
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 1;
});
