import { sha256, ValidationError } from './canonical.mjs';

export const AGENT_LINUX_ISOLATION_WORKFLOW_PATH =
  '.github/workflows/agent-linux-isolation.yml';

const EXPECTED_ACTION_REFERENCES = Object.freeze([
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'
]);

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
    'import { verifyAgentLinuxIsolationConformanceReceipt } from "./src/lib/agent-linux-isolation-conformance.mjs";',
    'verifyAgentLinuxIsolationConformanceReceipt(receipt);',
    'AXIOM_AGENT_READ_SYSTEM_FACTS_EFFECT_LAB: "1"',
    'AXIOM_AGENT_LINUX_ISOLATION_RECEIPT: ${{ runner.temp }}/axiom-agent-linux-isolation-conformance.json',
    'node src/read-system-facts-effect-drill.mjs',
    'import { verifyAgentReadSystemFactsEffectAdmission } from "./src/lib/agent-read-system-facts-effect-admission.mjs";',
    'import { verifyAgentReadSystemFactsEffectReceipt } from "./src/lib/agent-read-system-facts-effect.mjs";',
    'verifyAgentReadSystemFactsEffectAdmission(bundle.admission, {',
    'const effect = verifyAgentReadSystemFactsEffectReceipt(bundle.effect_receipt, {',
    'verifyAgentExecutorDurableStateReceipt(bundle.durable_head_receipt, {',
    'for (const value of Object.values(bundle.claims)) if (value !== false)',
    '${{ runner.temp }}/axiom-agent-read-system-facts-effect.json',
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
    'repository_dispatch:',
    'run-build',
    'run-tests',
    'start-local-test-services',
    'install-test-dependencies',
    'ssh ',
    'scp ',
    'tailscale',
    'wireguard'
  ]) {
    if (workflow.includes(forbidden)) {
      throw new ValidationError(
        `Agent Linux isolation workflow contains forbidden surface: ${forbidden}`
      );
    }
  }

  const actionReferences = [...workflow.matchAll(
    /^[ \t]*(?:-[ \t]+)?uses:[ \t]+([^\s#]+)/gm
  )].map(match => match[1]);
  if (
    actionReferences.length !== EXPECTED_ACTION_REFERENCES.length
    || actionReferences.some((reference, index) => (
      reference !== EXPECTED_ACTION_REFERENCES[index]
    ))
  ) {
    throw new ValidationError(
      'Agent Linux isolation workflow must use exactly the reviewed immutable action references'
    );
  }

  const jobsSection = workflow.split('\njobs:\n');
  if (jobsSection.length !== 2) {
    throw new ValidationError('Agent Linux isolation workflow must contain one jobs section');
  }
  const jobs = [...jobsSection[1].matchAll(/^  ([a-z0-9_-]+):[ \t]*$/gm)]
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
    fixed_probe_only: false,
    fixed_probe_isolation_present: true,
    read_system_facts_effect_present: true,
    general_executor_reachable: false,
    production_provisioning_reachable: false,
    receipt_reverification_required: true,
    effect_receipt_reverification_required: true,
    action_references: EXPECTED_ACTION_REFERENCES,
    workflow_sha256: sha256(workflow)
  });
}
