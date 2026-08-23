import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';

const TEST_CONCURRENCY = /^[1-9][0-9]*$/;
const MAX_TEST_CONCURRENCY = 64;

export function testRunnerArgs({ concurrency } = {}) {
  const args = ['--test', '--test-reporter=spec'];
  if (concurrency === undefined || concurrency === null || concurrency === '') return args;
  const raw = String(concurrency);
  if (!TEST_CONCURRENCY.test(raw)) {
    throw new ValidationError('AXIOM_TEST_CONCURRENCY must be a positive integer');
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > MAX_TEST_CONCURRENCY) {
    throw new ValidationError(
      `AXIOM_TEST_CONCURRENCY must be between 1 and ${MAX_TEST_CONCURRENCY}`
    );
  }
  return [...args, `--test-concurrency=${value}`];
}

export async function runTests({
  concurrency = process.env.AXIOM_TEST_CONCURRENCY,
  env = process.env
} = {}) {
  const args = testRunnerArgs({ concurrency });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Test runner terminated by ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runTests();
  } catch (error) {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  }
}
