import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import {
  appendCirclePeerRecord,
  circlePeerStatus,
  loadCirclePeerRuntime,
  openCirclePeerContent,
  publishCirclePeerDisclosureKey,
  runCirclePeerSync,
  sealCirclePeerContent,
  serveCirclePeer
} from './lib/circle-peer.mjs';

const USAGE = [
  'Usage: node src/circle-peer.mjs <command> <config.json> [arguments]',
  '  serve | sync | status',
  '  append <record-type> <record.json>     sign and add one of your records',
  '  publish-disclosure-key                 publish member.disclosure_key_file',
  '  seal <role[,role...]> <content.json>   seal content for those roles and publish it',
  '  open <update-digest>                   open sealed content addressed to you'
].join('\n');
const ARGUMENTS = { serve: 0, sync: 0, status: 0, append: 2, 'publish-disclosure-key': 0, seal: 2, open: 1 };
const MAX_INPUT_BYTES = 1_048_576;

async function readJson(path) {
  if (!isAbsolute(path)) throw new ValidationError('Input files must be given as absolute paths');
  const text = await readFile(path, 'utf8');
  if (Buffer.byteLength(text) > MAX_INPUT_BYTES) throw new ValidationError('Input file is too large');
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('Input file must contain valid JSON');
  }
}

// A member's Circle node (laboratory, off by default): see
// docs/operations/CIRCLE-EXCHANGE-TRANSPORT.md. The configuration must set
// "enabled": true; plain HTTP is never available from this command.
export async function runCirclePeerCommand(argv, {
  output = process.stdout,
  signal
} = {}) {
  const [command, configPath, ...rest] = argv;
  if (!Object.hasOwn(ARGUMENTS, command) || !configPath || rest.length !== ARGUMENTS[command]) {
    throw new ValidationError(USAGE);
  }
  const runtime = await loadCirclePeerRuntime(configPath);
  const write = result => {
    output.write(`${JSON.stringify(result)}\n`);
    return result;
  };
  if (command === 'append') {
    return write(await appendCirclePeerRecord(runtime, { recordType: rest[0], record: await readJson(rest[1]) }));
  }
  if (command === 'publish-disclosure-key') return write(await publishCirclePeerDisclosureKey(runtime));
  if (command === 'seal') {
    return write(await sealCirclePeerContent(runtime, { roleIds: rest[0].split(','), value: await readJson(rest[1]) }));
  }
  if (command === 'open') return write({ digest: rest[0], value: await openCirclePeerContent(runtime, rest[0]) });
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
