import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { AGENT_COMMONS_READONLY_METHODS } from '../src/lib/agent-commons-readonly-lab.mjs';
import { MCP_TOOL_MAP } from '../src/lib/agent-commons-mcp-readonly.mjs';
import { A2A_SKILL_MAP } from '../src/lib/agent-commons-a2a-card-candidate.mjs';
import {
  AGENT_COMMONS_PROTOCOL_PROJECTION_PARITY_SCHEMA,
  createAgentCommonsProtocolProjectionParity,
  validateAgentCommonsProtocolProjectionParity
} from '../src/lib/agent-commons-protocol-parity.mjs';

function currentParity() {
  return createAgentCommonsProtocolProjectionParity({
    c0Methods: AGENT_COMMONS_READONLY_METHODS,
    mcpToolMap: MCP_TOOL_MAP,
    a2aSkillMap: A2A_SKILL_MAP
  });
}

test('current C0, offline MCP and offline A2A mappings have exact one-to-one parity', () => {
  const report = currentParity();
  assert.equal(report.schema, AGENT_COMMONS_PROTOCOL_PROJECTION_PARITY_SCHEMA);
  assert.equal(report.c0_methods.length, 6);
  assert.equal(report.mappings.length, 6);
  assert.equal(report.mapping_equivalent, true);
  assert.equal(report.parity_scope, 'offline-public-discovery-mapping-only');
  assert.equal(report.c0_semantics_authoritative, true);
  assert.equal(report.source_exports_authenticated, false);
  assert.equal(report.mcp_transport_verified, false);
  assert.equal(report.a2a_transport_verified, false);
  assert.equal(report.protocol_conformance_claimed, false);
  assert.equal(report.live_authorization_performed, false);
  assert.equal(report.runtime_authority_parity_claimed, false);
  assert.equal(report.discovery_is_permission, false);
  assert.equal(report.protocol_metadata_is_permission, false);
  assert.equal(report.authority_granted, false);
  assert.equal(report.authority_effect, 'none');
  assert.equal(report.delegation_effect, 'none');
  assert.equal(report.report_authentication, 'none');
  assert.equal(report.portable_assurance, false);

  for (const mapping of report.mappings) {
    assert.equal(MCP_TOOL_MAP[mapping.mcp_tool_name], mapping.c0_method);
    assert.equal(A2A_SKILL_MAP[mapping.a2a_skill_id], mapping.c0_method);
  }
});

test('missing or duplicated protocol coverage fails closed', () => {
  const missing = { ...MCP_TOOL_MAP };
  delete missing.axiom_protocols_get;
  assert.throws(() => createAgentCommonsProtocolProjectionParity({
    c0Methods: AGENT_COMMONS_READONLY_METHODS,
    mcpToolMap: missing,
    a2aSkillMap: A2A_SKILL_MAP
  }), /exactly one external id|exact one-to-one C0 coverage/);

  const duplicated = {
    ...A2A_SKILL_MAP,
    axiom_protocols_get: 'project.get'
  };
  assert.throws(() => createAgentCommonsProtocolProjectionParity({
    c0Methods: AGENT_COMMONS_READONLY_METHODS,
    mcpToolMap: MCP_TOOL_MAP,
    a2aSkillMap: duplicated
  }), /exactly one external id/);
});

test('protocol mapping cannot introduce a non-C0 method', () => {
  const widened = {
    ...MCP_TOOL_MAP,
    axiom_protocols_get: 'system.execute'
  };
  assert.throws(() => createAgentCommonsProtocolProjectionParity({
    c0Methods: AGENT_COMMONS_READONLY_METHODS,
    mcpToolMap: widened,
    a2aSkillMap: A2A_SKILL_MAP
  }), /maps outside the canonical C0 method set/);
});

test('detached parity report cannot elevate compatibility, authority or portability claims', () => {
  const report = currentParity();
  for (const [field, value] of [
    ['protocol_conformance_claimed', true],
    ['live_authorization_performed', true],
    ['runtime_authority_parity_claimed', true],
    ['discovery_is_permission', true],
    ['protocol_metadata_is_permission', true],
    ['authority_granted', true],
    ['report_authentication', 'signed'],
    ['portable_assurance', true]
  ]) {
    const elevated = structuredClone(report);
    elevated[field] = value;
    assert.throws(
      () => validateAgentCommonsProtocolProjectionParity(elevated),
      new RegExp(`${field} must remain`)
    );
  }

  const unknown = structuredClone(report);
  unknown.execution_authorized = true;
  assert.throws(
    () => validateAgentCommonsProtocolProjectionParity(unknown),
    /unsupported field execution_authorized/
  );
});

test('mapping substitution cannot be hidden by recomputing only the outer report digest', () => {
  const report = currentParity();
  const tampered = structuredClone(report);
  tampered.mappings[0].mcp_tool_name = 'axiom_substituted_tool';
  const { parity_digest: ignored, ...body } = tampered;
  tampered.parity_digest = digestObject(body);
  assert.throws(
    () => validateAgentCommonsProtocolProjectionParity(tampered),
    /MCP mapping digest mismatch/
  );
});

test('protocol parity helper itself is effect-inert and does not import authority evaluators', async () => {
  const sourceUrl = new URL('../src/lib/agent-commons-protocol-parity.mjs', import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  assert.doesNotMatch(source, /agent-trust-authority-manifest|agent-trust-currentness|child_process|node:net|node:http|node:https/);
  assert.match(source, /from '\.\/canonical\.mjs'/);
});
