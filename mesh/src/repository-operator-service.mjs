#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { ValidationError, assertString } from './lib/canonical.mjs';
import { ensureMeshIdentity, loadTrustedKey } from './lib/identity.mjs';
import { readRepositoryOperatorToken, runGitHubRepositoryDocsOperator } from './repository-operator/github-docs-operator.mjs';
import { planGitHubRepositoryDocsEffect } from './repository-operator/github-docs-planner.mjs';
import { startRepositoryOperatorService } from './repository-operator/service.mjs';

export async function runRepositoryOperatorService({
  env = process.env,
  stdout = value => process.stdout.write(value),
  stderr = value => process.stderr.write(value)
} = {}) {
  if (env.NODE_ENV !== 'production') {
    throw new ValidationError('Repository operator service requires NODE_ENV=production');
  }
  if (env.AXIOM_REPOSITORY_OPERATOR_GITHUB_ORIGIN) {
    throw new ValidationError('Production repository operator service does not permit GitHub API origin override');
  }
  const dataDir = assertString(env.AXIOM_DATA_DIR, 'AXIOM_DATA_DIR', { min: 1, max: 4096 });
  const tokenFile = assertString(env.AXIOM_REPOSITORY_OPERATOR_TOKEN_FILE, 'AXIOM_REPOSITORY_OPERATOR_TOKEN_FILE', { min: 1, max: 4096 });
  const socketPath = assertString(env.AXIOM_REPOSITORY_OPERATOR_SOCKET, 'AXIOM_REPOSITORY_OPERATOR_SOCKET', { min: 1, max: 100 });

  const [operatorIdentity, hypervisorPublicKey, gridPublicKey, token] = await Promise.all([
    ensureMeshIdentity(dataDir, 'repository-operator', { create: false }),
    loadTrustedKey(dataDir, 'hypervisor'),
    loadTrustedKey(dataDir, 'grid'),
    readRepositoryOperatorToken(tokenFile)
  ]);

  let stopping = false;
  let resolveStop;
  const stopRequested = new Promise(resolve => { resolveStop = resolve; });
  const requestStop = () => {
    if (stopping) return;
    stopping = true;
    resolveStop();
  };
  const signalHandlers = new Map([
    ['SIGINT', requestStop],
    ['SIGTERM', requestStop]
  ]);
  const messageHandler = message => {
    if (message?.type === 'axiom.repository-operator.stop' || message?.type === 'axiom.service.stop') requestStop();
  };
  for (const [signal, handler] of signalHandlers) process.once(signal, handler);
  if (process.connected) process.once('message', messageHandler);

  let service;
  try {
    service = await startRepositoryOperatorService({
      socketPath,
      runOperator: request => runGitHubRepositoryDocsOperator({
        ...request,
        operatorIdentity,
        hypervisorPublicKey,
        gridPublicKey,
        token
      }),
      planOperator: request => planGitHubRepositoryDocsEffect({
        ...request,
        operatorIdentity,
        token
      })
    });
    stdout(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'repository-operator',
      event: 'runtime.ready',
      transport: 'unix-domain-socket',
      credential_scope: 'repository-operator-only',
      read_only_planning: true
    })}\n`);
    if (process.connected && typeof process.send === 'function') {
      try { process.send({ type: 'axiom.repository-operator.ready' }); } catch {}
    }
    await stopRequested;
    return 0;
  } catch (error) {
    stderr(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'repository-operator',
      event: 'runtime.failed',
      error: {
        name: error?.name ?? 'Error',
        code: error?.code
      }
    })}\n`);
    return 1;
  } finally {
    stopping = true;
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
    process.removeListener('message', messageHandler);
    await service?.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runRepositoryOperatorService();
}
