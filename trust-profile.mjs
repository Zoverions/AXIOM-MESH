import { spawnSync } from 'node:child_process';

const checks = [
  {
    id: 'metadata-authority-boundary',
    label: 'metadata/discovery cannot become authority',
    test: 'mesh/test/agent-commons-mcp-readonly.test.mjs'
  },
  {
    id: 'revocation-outcome-boundary',
    label: 'revoked or cancelled authority cannot survive queued or retried work',
    test: 'mesh/test/runtime-adapter-revocation-queue.test.mjs'
  }
];

function readSourceRef() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  const value = result.stdout.trim();
  return /^[0-9a-f]{40}$/u.test(value) ? value : null;
}

const results = checks.map((check) => {
  const result = spawnSync(process.execPath, ['--test', check.test], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    windowsHide: true
  });

  const passed = !result.error && result.status === 0;

  return {
    id: check.id,
    label: check.label,
    test: check.test,
    status: passed ? 'pass' : 'fail'
  };
});

const passed = results.every((result) => result.status === 'pass');

const profile = {
  schema: 'axiom-trust-profile.v0',
  source_ref: readSourceRef(),
  scope: 'source-level-offline',
  production_certification: false,
  authority_granted: false,
  telemetry_sent: false,
  checks: results,
  passed
};

process.stdout.write(`${JSON.stringify(profile, null, 2)}\n`);
process.exitCode = passed ? 0 : 1;
