import {
  AGENT_COMMONS_MCP_OFFLINE_FRAME_SCHEMA,
  MCP_PROTOCOL_VERSION,
  MCP_TOOL_MAP,
  createAgentCommonsMcpReadonlyProjection,
  validateAgentCommonsMcpReadonlyResponse
} from './lib/agent-commons-mcp-readonly.mjs';

const projection = await createAgentCommonsMcpReadonlyProjection();
const meta = {
  'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL_VERSION,
  'io.modelcontextprotocol/clientInfo': {
    name: 'axiom-mesh-conformance',
    version: '0.12.0-dev.3'
  },
  'io.modelcontextprotocol/clientCapabilities': {}
};

function frame(id, method, params, name = null) {
  return {
    schema: AGENT_COMMONS_MCP_OFFLINE_FRAME_SCHEMA,
    headers: {
      'mcp-protocol-version': MCP_PROTOCOL_VERSION,
      'mcp-method': method,
      ...(name === null ? {} : { 'mcp-name': name })
    },
    body: {
      jsonrpc: '2.0',
      id,
      method,
      params: { ...params, _meta: structuredClone(meta) }
    }
  };
}

const observations = [];

for (const request of [
  frame('discover', 'server/discover', {}),
  frame('tools', 'tools/list', {})
]) {
  const response = await projection.handle(request);
  validateAgentCommonsMcpReadonlyResponse(response);
  observations.push({
    method: request.body.method,
    result_type: response.result.resultType
  });
}

for (const toolName of Object.keys(MCP_TOOL_MAP)) {
  const response = await projection.handle(
    frame(`tool-${toolName}`, 'tools/call', { name: toolName, arguments: {} }, toolName)
  );
  validateAgentCommonsMcpReadonlyResponse(response);
  observations.push({
    method: 'tools/call',
    tool: toolName,
    axiom_method: response.result.structuredContent.axiom_method,
    axiom_digest: response.result.structuredContent.axiom_response.digest
  });
}

process.stdout.write(`${JSON.stringify({
  valid: true,
  schema: projection.schema,
  protocol_version: projection.protocol_version,
  transport: projection.transport,
  network_listener: projection.network_listener,
  session_state: projection.session_state,
  public_state_only: projection.public_state_only,
  compatibility_claimed: projection.compatibility_claimed,
  observations
}, null, 2)}\n`);
