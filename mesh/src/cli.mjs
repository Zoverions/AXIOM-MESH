#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { meshConfig } from './lib/config.mjs';

const COMMAND_ORDER = Object.freeze([
  'status',
  'capabilities',
  'intent',
  'intent-state',
  'audit',
  'backup'
]);

export function parseCliArguments(argv) {
  if (!Array.isArray(argv)) throw new TypeError('CLI arguments must be an array');
  const positional = [];
  let json = false;
  let human = false;
  let help = false;
  for (const argument of argv) {
    if (argument === '--json') json = true;
    else if (argument === '--human') human = true;
    else if (argument === '--help' || argument === '-h') help = true;
    else positional.push(argument);
  }
  const [command = 'status', ...args] = positional;
  return {
    command: help ? 'help' : command,
    args,
    json,
    human
  };
}

export function cliHelp() {
  return `AXIOM-MESH command line\n\nUsage:\n  npm run axiom -- <command> [arguments] [--json]\n\nCommands:\n  status                              Show the current kernel and capability summary\n  capabilities                        Print the signed capability registry view\n  intent <action> [json-input]         Submit one authenticated intent\n  intent-state <contract-id>           Read Grid-authenticated Intent state via governance\n  audit                               Verify the current evidence chain\n  backup list                         List encrypted backups\n  backup show <backup-id>             Show one backup manifest\n  backup restore <path> <sha256>      Restore with an exact expected database digest\n\nOptions:\n  --json                              Emit the complete JSON response\n  --human                             Render a concise status summary\n  -h, --help                          Show this help\n\nFirst run:\n  npm run dev\n  npm run axiom -- status\n`;
}

export function formatCliResult(command, result, {
  json = false,
  human = false
} = {}) {
  if (json || !human || command !== 'status') {
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  const counts = result?.capability_counts ?? {};
  const orderedStatuses = [
    'implemented',
    'experimental',
    'specified',
    'adapter_required',
    'disabled'
  ];
  const capabilitySummary = orderedStatuses
    .filter(status => Number.isInteger(counts[status]))
    .map(status => `${status}=${counts[status]}`)
    .join(', ');
  const grid = result?.runtime?.grid;
  const gridState = typeof grid?.status === 'string' ? grid.status : 'reachable';
  const lines = [
    `AXIOM-MESH ${result?.kernel_version ?? 'unknown'}`,
    'Gateway API: reachable',
    `Grid: ${grid ? gridState : 'not reported'}`
  ];
  if (capabilitySummary) lines.push(`Capabilities: ${capabilitySummary}`);
  if (result?.claim_source_digest) {
    lines.push(`Claim source digest: ${result.claim_source_digest}`);
  }
  lines.push('Next: npm run axiom -- capabilities');
  lines.push('Full response: npm run axiom -- status --json');
  return `${lines.join('\n')}\n`;
}

export async function runCli(argv, {
  config = meshConfig(),
  fetchImpl = fetch,
  env = process.env,
  readFileImpl = readFile,
  now = () => Date.now(),
  randomUuid = () => crypto.randomUUID()
} = {}) {
  const { command, args } = parseCliArguments(argv);
  if (command === 'help') return { help: cliHelp() };
  const gatewayHost = config.hosts.gateway === '0.0.0.0' ? '127.0.0.1' : config.hosts.gateway;
  const baseUrl = env.AXIOM_GATEWAY_URL ?? `http://${gatewayHost}:${config.ports.gateway}`;
  let token;
  const resolveToken = async () => {
    token ??= env.AXIOM_API_TOKEN
      ?? (await readFileImpl(join(config.dataDir, 'dev-admin.token'), 'utf8')).trim();
    if (!token) throw new Error('AXIOM_API_TOKEN or a provisioned development token is required');
    return token;
  };
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
    'intent-state': async () => {
      const contractId = args[0];
      if (!contractId) {
        throw new Error('Usage: npm run axiom -- intent-state <contract-id>');
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(contractId)) {
        throw new Error('Intent Contract ID has an invalid format');
      }
      const page = await request('/v1/proposals?limit=100');
      const proposal = page.proposals?.find(item => (
        item.intent_state?.contract_id === contractId
      ));
      if (!proposal?.intent_state) {
        const error = new Error(
          `Active Intent Contract was not found in the bounded governance view: ${contractId}`
        );
        error.code = 'intent_contract_not_active';
        error.status = 404;
        throw error;
      }
      return proposal.intent_state;
    },
    backup: async () => {
      const [subcommand = 'list', target, expectedDigest] = args;
      if (subcommand === 'list') return request('/v1/backups');
      if (subcommand === 'show') {
        if (!target) throw new Error('Usage: npm run axiom -- backup show <backup-id>');
        return request(`/v1/backups/${encodeURIComponent(target)}`);
      }
      if (subcommand === 'restore') {
        if (!target || !expectedDigest) {
          throw new Error(
            'Usage: npm run axiom -- backup restore <manifest-path> <expected-database-sha256>'
          );
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
      if (!action) throw new Error('Usage: npm run axiom -- intent <action> [json-input]');
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
  if (!commands[command]) {
    throw new Error(
      `Unknown command: ${command}. Available commands: ${COMMAND_ORDER.join(', ')}`
    );
  }
  return commands[command]();
}

function cliFailureMessage(error) {
  const detail = error instanceof Error ? error.message : String(error);
  const connectionFailure = error?.cause?.code === 'ECONNREFUSED'
    || error?.code === 'ECONNREFUSED'
    || /fetch failed|ECONNREFUSED/i.test(detail);
  return [
    `AXIOM-MESH CLI error: ${detail}`,
    connectionFailure ? 'Start the local runtime with: npm run dev' : null,
    'Help: npm run axiom -- --help'
  ].filter(Boolean).join('\n');
}

async function main() {
  const parsed = parseCliArguments(process.argv.slice(2));
  if (parsed.command === 'help') {
    process.stdout.write(cliHelp());
    return;
  }
  const result = await runCli([parsed.command, ...parsed.args]);
  process.stdout.write(formatCliResult(parsed.command, result, {
    json: parsed.json,
    human: parsed.human
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${cliFailureMessage(error)}\n`);
    process.exitCode = 1;
  }
}
