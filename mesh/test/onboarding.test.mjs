import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cliHelp,
  formatCliResult,
  parseCliArguments,
  runCli
} from '../src/cli.mjs';
import {
  doctorFailureMessage,
  formatDoctorResult,
  runDoctor
} from '../src/doctor.mjs';

const CONFIG = Object.freeze({
  hosts: {
    gateway: '127.0.0.1',
    hypervisor: '127.0.0.1',
    sandbox: '127.0.0.1',
    grid: '127.0.0.1'
  },
  ports: {
    gateway: 4010,
    hypervisor: 4011,
    sandbox: 4012,
    grid: 4013
  },
  dataDir: '/synthetic/axiom-data'
});

test('CLI exposes local-first help and explicit output modes', () => {
  assert.deepEqual(parseCliArguments(['status', '--json']), {
    command: 'status',
    args: [],
    json: true,
    human: false
  });
  assert.deepEqual(parseCliArguments(['--human', '--help']), {
    command: 'help',
    args: [],
    json: false,
    human: true
  });
  assert.match(cliHelp(), /npm run axiom -- status/);
  assert.doesNotMatch(cliHelp(), /npx axiom/);
});

test('CLI status keeps authenticated JSON compatibility and adds an opt-in readable summary', async () => {
  const payload = {
    kernel_version: '0.12.0-dev.3',
    claim_source_digest: 'abc123',
    runtime: { grid: { records: 12 } },
    capability_counts: {
      implemented: 26,
      experimental: 2,
      specified: 3,
      adapter_required: 9,
      disabled: 4
    }
  };
  const requests = [];
  const result = await runCli(['status'], {
    config: CONFIG,
    env: { AXIOM_API_TOKEN: 'synthetic-token' },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => payload
      };
    }
  });

  assert.deepEqual(result, payload);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://127.0.0.1:4010/v1/status');
  assert.equal(requests[0].options.headers.authorization, 'Bearer synthetic-token');

  const raw = `${JSON.stringify(payload, null, 2)}\n`;
  assert.equal(formatCliResult('status', result), raw);
  assert.equal(formatCliResult('status', result, { json: true, human: true }), raw);

  const human = formatCliResult('status', result, { human: true });
  assert.match(human, /AXIOM-MESH 0\.12\.0-dev\.3/);
  assert.match(human, /Gateway API: reachable/);
  assert.match(human, /implemented=26/);
  assert.match(human, /Full response: npm run axiom -- status --json/);
});

test('CLI rejects unknown commands before resolving credentials', async () => {
  await assert.rejects(
    runCli(['unknown'], {
      config: CONFIG,
      env: {},
      readFileImpl: async () => {
        throw new Error('credential lookup should not run');
      }
    }),
    /Unknown command: unknown/
  );
});

test('doctor verifies setup and every configured service port without provisioning', async () => {
  const checked = [];
  const result = await runDoctor({
    config: CONFIG,
    verifySetup: async () => ({
      valid: true,
      runtime: { node: '24.18.0', npm: '11.9.0' },
      dependency_packages: 0
    }),
    checkPort: async input => {
      checked.push(input);
      return input.service === 'sandbox'
        ? { available: false, code: 'EADDRINUSE' }
        : { available: true, code: null };
    }
  });

  assert.equal(result.schema, 'axiom-doctor.v1');
  assert.equal(result.ready, false);
  assert.equal(result.production_credentials_created, false);
  assert.deepEqual(checked.map(item => item.service), [
    'gateway',
    'hypervisor',
    'sandbox',
    'grid'
  ]);
  assert.match(formatDoctorResult(result), /sandbox: 127\.0\.0\.1:4012 blocked \(EADDRINUSE\)/);
});

test('doctor gives exact remediation for unsupported Node and npm versions', () => {
  assert.match(
    doctorFailureMessage(new Error('Node.js 22.16.0 is outside 24.14.0 <= version < 25.0.0')),
    /nvm install 24\.18\.0/
  );
  assert.match(
    doctorFailureMessage(new Error('npm 10.9.2 is outside 11.0.0 <= version < 12.0.0')),
    /npm install --global npm@11/
  );
});
