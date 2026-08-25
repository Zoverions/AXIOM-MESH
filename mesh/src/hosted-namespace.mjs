import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';

export async function initializeHostedNamespace({
  environment = process.env,
  enableLoopback = () => execFileSync('ip', ['link', 'set', 'lo', 'up'], {
    stdio: 'ignore',
    timeout: 5_000,
    windowsHide: true
  }),
  inspectBoundary = async () => {
    const { assertDenyEgressBoundary } = await import('./network-boundary.mjs');
    return assertDenyEgressBoundary();
  },
  startSupervisor = async () => {
    const { runProductionSupervisor } = await import('./supervisor.mjs');
    return runProductionSupervisor();
  }
} = {}) {
  if (
    environment.NODE_ENV !== 'production'
    || environment.AXIOM_AUTO_BOOTSTRAP !== 'false'
    || environment.AXIOM_REQUIRE_DENY_EGRESS !== 'true'
    || environment.AXIOM_INTERNAL_TLS !== 'true'
  ) {
    throw new ValidationError(
      'Hosted production namespace requires production mode, mutual TLS, disabled bootstrap, and deny-egress enforcement'
    );
  }
  enableLoopback();
  await inspectBoundary();
  return startSupervisor();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await initializeHostedNamespace();
  } catch (error) {
    process.stderr.write(`AXIOM hosted namespace failed closed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
