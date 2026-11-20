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
  activate = false,
  callHypervisor = null,
  callActivation = null
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
  if (typeof activate !== 'boolean') {
    throw new TypeError('Machine currentness activation selection must be boolean');
  }
  let identity = null;
  async function gatewayIdentity() {
    identity ??= await ensureMeshIdentity(config.dataDir, 'gateway', {
      create: false
    });
    return identity;
  }
  const report = callHypervisor !== null
    ? await callHypervisor(request)
    : await signedFetch(
        await gatewayIdentity(),
        'hypervisor',
        `${config.urls.hypervisor}/internal/v1/machine-currentness/preflight`,
        {
          method: 'POST',
          body: request
        }
      );
  if (!activate) return report;
  if (!report?.ready) return { report, activation: null };

  const activationRequest = { report_digest: report.report_digest };
  const activation = callActivation !== null
    ? await callActivation(activationRequest)
    : await signedFetch(
        await gatewayIdentity(),
        'hypervisor',
        `${config.urls.hypervisor}/internal/v1/machine-currentness/activate`,
        {
          method: 'POST',
          body: activationRequest
        }
      );
  return { report, activation };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const activationSelection = process.env.AXIOM_MACHINE_CURRENTNESS_ACTIVATE;
  if (activationSelection !== undefined && !['true', 'false'].includes(activationSelection)) {
    throw new TypeError('AXIOM_MACHINE_CURRENTNESS_ACTIVATE must be true or false');
  }
  const activate = activationSelection === 'true';
  const result = await runMachineCurrentnessProductionPreflightOperator({
    sourceRevision: process.env.AXIOM_SOURCE_REVISION,
    activate
  });
  const report = activate ? result.report : result;
  process.stdout.write(`${canonicalJson(result)}\n`);
  if (!report.ready) process.exitCode = 2;
}
