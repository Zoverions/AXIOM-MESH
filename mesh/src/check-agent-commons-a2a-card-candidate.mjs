#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  A2A_MAINTENANCE_RELEASE,
  A2A_PROTOCOL_VERSION,
  A2A_SPEC_RELEASE,
  createAgentCommonsA2aCardCandidateProjection,
  validateAgentCommonsA2aCardCandidateManifest,
  validateAgentCommonsA2aCardCandidateProjection
} from './lib/agent-commons-a2a-card-candidate.mjs';

const manifestUrl = new URL('../../agent-commons/a2a-card-candidate.json', import.meta.url);

async function main() {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  const manifestStatus = validateAgentCommonsA2aCardCandidateManifest(manifest);
  const projection = await createAgentCommonsA2aCardCandidateProjection();
  validateAgentCommonsA2aCardCandidateProjection(projection);

  process.stdout.write(`${JSON.stringify({
    valid: true,
    schema: projection.schema,
    protocol_version: A2A_PROTOCOL_VERSION,
    spec_release: A2A_SPEC_RELEASE,
    maintenance_release: A2A_MAINTENANCE_RELEASE,
    agent_card_servable: false,
    agent_card_conformant: false,
    supported_interfaces_advertised: 0,
    network_listener: false,
    public_state_only: true,
    authority_granted: false,
    compatibility_claimed: false,
    skills: manifestStatus.skills,
    digest: projection.digest
  }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({
    valid: false,
    error: error?.message ?? String(error)
  })}\n`);
  process.exitCode = 1;
});
