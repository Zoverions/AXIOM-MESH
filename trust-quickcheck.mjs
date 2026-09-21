import { spawnSync } from 'node:child_process';

const checks = [
  {
    label: 'metadata/discovery cannot become authority',
    args: ['--test', 'mesh/test/agent-commons-mcp-readonly.test.mjs']
  },
  {
    label: 'revoked or cancelled authority cannot survive queued or retried work',
    args: ['--test', 'mesh/test/runtime-adapter-revocation-queue.test.mjs']
  }
];

console.log('AXIOM-MESH trust quickcheck');
console.log('Source-level, offline falsification only. No external runtime or production authority is enabled.');

for (const check of checks) {
  console.log(`\n==> ${check.label}`);
  const result = spawnSync(process.execPath, check.args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('\nQuickcheck passed. This is evidence for the tested source-level invariants only; it is not production certification or permission to execute consequential effects.');
