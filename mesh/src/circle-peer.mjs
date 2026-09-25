import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import {
  circlePeerStatus,
  loadCirclePeerRuntime,
  runCirclePeerSync,
  serveCirclePeer
} from './lib/circle-peer.mjs';

// A member's Circle node (laboratory, off by default): see
// docs/operations/CIRCLE-EXCHANGE-TRANSPORT.md. The configuration must set
// "enabled": true; plain HTTP is never available from this command.
export async function runCirclePeerCommand(argv, {
  output = process.stdout,
  signal
} = {}) {
  const [command, configPath, ...rest] = argv;
  if (!['serve', 'sync', 'status'].includes(command) || !configPath || rest.length) {
    throw new ValidationError('Usage: node src/circle-peer.mjs <serve|sync|status> <config.json>');
  }
  const runtime = await loadCirclePeerRuntime(configPath);
  if (command === 'status') {
    const status = await circlePeerStatus(runtime);
    output.write(`${JSON.stringify(status)}\n`);
    return status;
  }
  if (command === 'sync') {
    const result = await runCirclePeerSync(runtime);
    output.write(`${JSON.stringify(result)}\n`);
    return result;
  }
  const node = await serveCirclePeer(runtime);
  output.write(`${JSON.stringify({ serving: runtime.genesis_digest, port: node.port, peers: runtime.peers.length })}\n`);
  if (runtime.peers.length) await node.syncOnce().catch(() => {});
  await new Promise(resolveStop => {
    if (signal?.aborted) resolveStop();
    signal?.addEventListener('abort', resolveStop, { once: true });
  });
  await node.close();
  return node.status();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  for (const name of ['SIGINT', 'SIGTERM']) process.once(name, () => controller.abort());
  await runCirclePeerCommand(process.argv.slice(2), { signal: controller.signal });
}
