import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAxiomOnePolicy } from './mesh/src/check-axiom-one.mjs';

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const policyPath = join(repositoryRoot, 'apps', 'axiom-one', 'app-policy.json');

function readSourceState() {
  const refResult = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
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
    cwd: repositoryRoot,
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

let policy;
let policyValidated = false;

try {
  policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  validateAxiomOnePolicy(policy);
  policyValidated = true;
} catch {
  policy = null;
}

const sourceState = readSourceState();
const lifecycle = policy?.memory_lifecycle ?? null;
const passed =
  policyValidated === true &&
  sourceState.sourceRef !== null &&
  sourceState.workingTreeClean === true;

const profile = {
  schema: 'axiom-memory-lifecycle-profile.v0',
  source_ref: sourceState.sourceRef,
  working_tree_clean: sourceState.workingTreeClean,
  scope: 'axiom-one-experimental-local-preview',
  production_certification: false,
  external_provider_used: false,
  network_access_required: false,
  telemetry_sent: false,
  authority_granted: false,
  preview_status: policy?.status ?? null,
  memory_lifecycle: lifecycle
    ? {
        status: lifecycle.status,
        actions: lifecycle.actions,
        read_route: lifecycle.read_route,
        provenance_relations: lifecycle.provenance_relations,
        self_links: lifecycle.self_links,
        correction_replaces_original: lifecycle.correction_replaces_original,
        link_deletion: lifecycle.link_deletion,
        export_routes: lifecycle.export_routes,
        bundle_reveal: lifecycle.bundle_reveal,
        persistent_browser_storage: lifecycle.persistent_browser_storage,
        hard_delete: lifecycle.hard_delete,
        restore: lifecycle.restore,
        sharing: lifecycle.sharing
      }
    : null,
  passed
};

process.stdout.write(`${JSON.stringify(profile, null, 2)}\n`);
process.exitCode = passed ? 0 : 1;
