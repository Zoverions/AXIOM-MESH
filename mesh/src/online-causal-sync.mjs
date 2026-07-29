import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import {
  applyOnlineCausalSyncBundle,
  loadOnlineCausalSyncRuntime,
  onlineCausalSyncStatus,
  pollOnlineCausalSync,
  resetOnlineCausalSyncRetry
} from './lib/online-causal-sync.mjs';

export async function runOnlineCausalSyncCommand(argv, {
  fetchImpl = fetch,
  output = process.stdout,
  signal
} = {}) {
  const [command, configPath, bundleDigest, approvalId] = argv;
  if (
    !['poll', 'run', 'status', 'apply', 'retry'].includes(command)
    || !configPath
    || (command === 'apply' && (!bundleDigest || !approvalId))
    || (command !== 'apply' && (bundleDigest || approvalId))
  ) {
    throw new ValidationError(
      'Usage: node src/online-causal-sync.mjs '
      + '<poll|run|status|retry> <config.json> OR '
      + 'apply <config.json> <bundle-digest> <approval-id>'
    );
  }
  const runtime = await loadOnlineCausalSyncRuntime(configPath);
  if (command === 'status') {
    const status = await onlineCausalSyncStatus(runtime);
    writeStatus(output, status);
    return status;
  }
  if (command === 'retry') {
    const status = await resetOnlineCausalSyncRetry(runtime);
    writeStatus(output, status);
    return status;
  }
  if (command === 'apply') {
    const status = await applyOnlineCausalSyncBundle(runtime, {
      bundleDigest,
      approvalId,
      fetchImpl
    });
    writeStatus(output, status);
    return status;
  }
  if (command === 'poll') {
    const status = await pollOnlineCausalSync(runtime, { fetchImpl });
    writeStatus(output, status);
    return status;
  }
  while (!signal?.aborted) {
    const status = await pollOnlineCausalSync(runtime, { fetchImpl });
    writeStatus(output, status);
    if (signal?.aborted) break;
    const nextAttempt = status.failure
      ? Math.max(0, Date.parse(status.failure.next_attempt_at) - Date.now())
      : runtime.config.poll_interval_ms;
    await delay(
      Math.max(1_000, Math.min(runtime.config.poll_interval_ms, nextAttempt)),
      undefined,
      signal ? { signal } : undefined
    ).catch(error => {
      if (error?.name !== 'AbortError') throw error;
    });
  }
  return onlineCausalSyncStatus(runtime);
}

function writeStatus(output, status) {
  output.write(`${JSON.stringify(status)}\n`);
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => controller.abort());
  }
  await runOnlineCausalSyncCommand(process.argv.slice(2), {
    signal: controller.signal
  });
}
