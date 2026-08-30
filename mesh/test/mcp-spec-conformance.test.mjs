import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  MCP_ERROR_CODES,
  MCP_PROTOCOL_VERSION
} from '../src/lib/agent-commons-mcp-readonly.mjs';

const fixtureUrl = new URL('./fixtures/mcp-2026-07-28-error-codes.json', import.meta.url);

test('MCP 2026-07-28 protocol constants match the pinned external specification fixture', async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));

  assert.equal(fixture.schema, 'axiom-mcp-spec-fixture.v1');
  assert.equal(MCP_PROTOCOL_VERSION, fixture.protocol_version);
  assert.equal(MCP_ERROR_CODES.header_mismatch, fixture.error_codes.HeaderMismatch);
  assert.equal(
    MCP_ERROR_CODES.missing_required_client_capability,
    fixture.error_codes.MissingRequiredClientCapability
  );
  assert.equal(
    MCP_ERROR_CODES.unsupported_protocol_version,
    fixture.error_codes.UnsupportedProtocolVersion
  );
});
