import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { canonicalJson, ValidationError } from './lib/canonical.mjs';
import { verifyCiCheckoutFreshness } from './lib/ci-checkout-freshness.mjs';

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${name} is required for CI checkout freshness verification`);
  }
  return value;
}

function optionalEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.length ? value : null;
}

export async function runCiCheckoutFreshnessFromEnvironment({
  repositoryPath = process.cwd(),
  observedAt = new Date().toISOString()
} = {}) {
  return verifyCiCheckoutFreshness({
    repository_path: resolve(repositoryPath),
    event_name: requiredEnv('AXIOM_CI_EVENT_NAME'),
    event_revision: requiredEnv('AXIOM_CI_EVENT_SHA'),
    proposal_head_revision: optionalEnv('AXIOM_CI_PR_HEAD_SHA'),
    base_revision: optionalEnv('AXIOM_CI_PR_BASE_SHA'),
    workflow_path: requiredEnv('AXIOM_CI_WORKFLOW_PATH'),
    observed_at: observedAt
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await runCiCheckoutFreshnessFromEnvironment();
  process.stdout.write(`${canonicalJson(evidence)}\n`);
}
