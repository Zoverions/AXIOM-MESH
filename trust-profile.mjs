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

function readSourceState() {
  const refResult = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true
  });

  if (refResult.error || refResult.status !== 0) {
    return { sourceRef: null, workingTreeClean: null };
  }

  const sourceRef = refResult.stdout.trim();
  if (!/^[0-9a-f]{40}$/u.test(sourceRef)) {
    return { sourceRef: null, workingTreeClean: null };
  }

  const statusResult = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true
  });

  if (statusResult.error || statusResult.status !== 0) {
    return { sourceRef, workingTreeClean: null };
  }

  return {
    sourceRef,
    workingTreeClean: statusResult.stdout.length === 0
  };
}

const sourceState = readSourceState();

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

const passed =
  sourceState.sourceRef !== null &&
  sourceState.workingTreeClean === true &&
  results.every((result) => result.status === 'pass');

const profile = {
  schema: 'axiom-trust-profile.v0',
  source_ref: sourceState.sourceRef,
  working_tree_clean: sourceState.workingTreeClean,
  scope: 'source-level-offline',
  production_certification: false,
  authority_granted: false,
  telemetry_sent: false,
  checks: results,
  passed
};

process.stdout.write(`${JSON.stringify(profile, null, 2)}\n`);
process.exitCode = passed ? 0 : 1;
