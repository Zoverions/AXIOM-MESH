import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { meshConfig } from './lib/config.mjs';

export async function runCli(argv, {
  config = meshConfig(),
  fetchImpl = fetch,
  env = process.env,
  readFileImpl = readFile,
  now = () => Date.now(),
  randomUuid = () => crypto.randomUUID()
} = {}) {
  if (!Array.isArray(argv)) throw new TypeError('CLI arguments must be an array');
  const gatewayHost = config.hosts.gateway === '0.0.0.0' ? '127.0.0.1' : config.hosts.gateway;
  const baseUrl = env.AXIOM_GATEWAY_URL ?? `http://${gatewayHost}:${config.ports.gateway}`;
  let token;
  const resolveToken = async () => {
    token ??= env.AXIOM_API_TOKEN
      ?? (await readFileImpl(join(config.dataDir, 'dev-admin.token'), 'utf8')).trim();
    if (!token) throw new Error('AXIOM_API_TOKEN or a provisioned development token is required');
    return token;
  };
  const [command = 'status', ...args] = argv;
  const request = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        authorization: `Bearer ${await resolveToken()}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers
      }
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Gateway returned non-JSON response (${response.status})`);
    }
    if (!response.ok) {
      const error = new Error(`${response.status}: ${payload.error?.message ?? 'Request failed'}`);
      error.code = payload.error?.code ?? 'gateway_request_failed';
      error.status = response.status;
      throw error;
    }
    return payload;
  };
  const commands = {
    status: () => request('/v1/status'),
    capabilities: () => request('/v1/capabilities'),
    audit: () => request('/v1/audit/verify'),
    backup: async () => {
      const [subcommand = 'list', target, expectedDigest] = args;
      if (subcommand === 'list') return request('/v1/backups');
      if (subcommand === 'show') {
        if (!target) throw new Error('Usage: node src/cli.mjs backup show <backup-id>');
        return request(`/v1/backups/${encodeURIComponent(target)}`);
      }
      if (subcommand === 'restore') {
        if (!target || !expectedDigest) {
          throw new Error('Usage: node src/cli.mjs backup restore <manifest-path> <expected-database-sha256>');
        }
        const [{ ensureMeshIdentity }, { loadDataProtector }, { restoreGridBackup }] = await Promise.all([
          import('./lib/identity.mjs'),
          import('./lib/protector.mjs'),
          import('./grid/backup.mjs')
        ]);
        const identity = await ensureMeshIdentity(config.dataDir, 'grid', { create: false });
        const protector = await loadDataProtector({ ...config, autoBootstrap: false });
        return restoreGridBackup({
          manifestPath: target,
          dataDir: config.dataDir,
          identity,
          protector,
          expectedDatabaseDigest: expectedDigest
        });
      }
      throw new Error(`Unknown backup command: ${subcommand}`);
    },
    intent: async () => {
      const action = args[0];
      if (!action) throw new Error('Usage: node src/cli.mjs intent <action> [json-input]');
      let input = {};
      if (args[1]) {
        try {
          input = JSON.parse(args[1]);
        } catch {
          throw new Error('Intent input must be valid JSON');
        }
      }
      if (!input || Array.isArray(input) || typeof input !== 'object') {
        throw new Error('Intent input must be a JSON object');
      }
      return request('/v1/intents', {
        method: 'POST',
        headers: { 'idempotency-key': `cli-${now()}-${randomUuid()}` },
        body: { action, input }
      });
    }
  };
  if (!commands[command]) throw new Error(`Unknown command: ${command}`);
  return commands[command]();
}

async function main() {
  const result = await runCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
