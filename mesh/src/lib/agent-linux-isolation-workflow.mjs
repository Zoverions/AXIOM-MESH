import { sha256, ValidationError } from './canonical.mjs';

export const AGENT_LINUX_ISOLATION_WORKFLOW_PATH =
  '.github/workflows/agent-linux-isolation.yml';

const PINNED_ACTION = /@[a-f0-9]{40}$/;

export function verifyAgentLinuxIsolationWorkflow(workflow) {
  if (typeof workflow !== 'string' || workflow.length < 1) {
    throw new ValidationError('Agent Linux isolation workflow is missing');
  }

  for (const required of [
    'name: Agent Linux Isolation Conformance',
    'pull_request:',
    'branches: ["main"]',
    'workflow_dispatch:',
    'permissions:',
    'contents: read',
    'runs-on: ubuntu-24.04',
    'timeout-minutes: 5',
    'persist-credentials: false',
    'node-version: "24.18.0"',
    'package-manager-cache: false',
    'test -x /usr/bin/docker',
    'test "$(readlink -f /usr/bin/docker)" = "/usr/bin/docker"',
    'docker build --pull=false --tag axiom-mesh-kernel:0.12.0-dev.3 .',
    'AXIOM_AGENT_LINUX_ISOLATION_LAB: "1"',
    'node src/linux-isolation-adapter-drill.mjs',
    'verifyAgentLinuxIsolationConformanceReceipt',
    'axiom-agent-linux-isolation-conformance-${{ github.sha }}',
    'retention-days: 90'
  ]) {
    if (!workflow.includes(required)) {
      throw new ValidationError(
        `Agent Linux isolation workflow is missing governed boundary: ${required}`
      );
    }
  }

  for (const forbidden of [
    'pull_request_target:',
    'permissions: write-all',
    'contents: write',
    'actions: write',
    'id-token: write',
    'packages: write',
    'secrets.',
    'persist-credentials: true',
    'runs-on: self-hosted',
    'runs-on: [self-hosted',
    'provision-production',
    'docker compose',
    'docker login',
    '--privileged',
    '--network host',
    '--pid host',
    '/var/run/docker.sock:',
    'workflow_run:',
    'repository_dispatch:'
  ]) {
    if (workflow.includes(forbidden)) {
      throw new ValidationError(
        `Agent Linux isolation workflow contains forbidden surface: ${forbidden}`
      );
    }
  }

  const actionReferences = [...workflow.matchAll(/^\s*-\s+uses:\s+([^\s#]+)/gm)]
    .map(match => match[1]);
  if (
    actionReferences.length !== 3
    || actionReferences.some(reference => !PINNED_ACTION.test(reference))
  ) {
    throw new ValidationError(
      'Agent Linux isolation workflow must use exactly three immutable action references'
    );
  }

  const jobs = [...workflow.matchAll(/^  ([a-z0-9_-]+):\s*$/gm)]
    .map(match => match[1]);
  if (jobs.length !== 1 || jobs[0] !== 'conformance') {
    throw new ValidationError(
      'Agent Linux isolation workflow must expose only the conformance job'
    );
  }

  return Object.freeze({
    runner: 'ubuntu-24.04',
    node_version: '24.18.0',
    permissions: 'contents-read',
    persisted_checkout_credentials: false,
    github_secrets_referenced: false,
    fixed_probe_only: true,
    production_provisioning_reachable: false,
    workflow_sha256: sha256(workflow)
  });
}
