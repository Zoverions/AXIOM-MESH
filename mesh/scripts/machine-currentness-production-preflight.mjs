import { pathToFileURL } from 'node:url';

import { signedFetch } from '../src/lib/client.mjs';
import { assertString, canonicalJson } from '../src/lib/canonical.mjs';
import { loadApiPrincipals, meshConfig } from '../src/lib/config.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import {
  enumerateConfiguredMachinePrincipalAuthorities
} from '../src/lib/machine-principal-currentness.mjs';

const REVISION = /^[a-f0-9]{40}$/;

export async function runMachineCurrentnessProductionPreflightOperator({
  config = meshConfig(),
  sourceRevision,
  callHypervisor = null
} = {}) {
  const revision = assertString(sourceRevision, 'source revision', {
    max: 40,
    pattern: REVISION
  });
  const configuredSource = enumerateConfiguredMachinePrincipalAuthorities(
    await loadApiPrincipals(config)
  );
  const request = {
    source_revision: revision,
    configured_source: configuredSource
  };
  if (callHypervisor !== null) return callHypervisor(request);

  const identity = await ensureMeshIdentity(config.dataDir, 'gateway', {
    create: false
  });
  return signedFetch(
    identity,
    'hypervisor',
    `${config.urls.hypervisor}/internal/v1/machine-currentness/preflight`,
    {
      method: 'POST',
      body: request
    }
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runMachineCurrentnessProductionPreflightOperator({
    sourceRevision: process.env.AXIOM_SOURCE_REVISION
  });
  process.stdout.write(`${canonicalJson(report)}\n`);
  if (!report.ready) process.exitCode = 2;
}
