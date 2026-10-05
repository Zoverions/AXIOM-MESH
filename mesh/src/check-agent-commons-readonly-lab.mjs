import {
  AGENT_COMMONS_READONLY_METHODS,
  AGENT_COMMONS_READONLY_REQUEST_SCHEMA,
  createAgentCommonsReadonlyLab,
  validateAgentCommonsReadonlyResponse
} from './lib/agent-commons-readonly-lab.mjs';

const lab = await createAgentCommonsReadonlyLab();
const responses = [];

for (const [index, method] of AGENT_COMMONS_READONLY_METHODS.entries()) {
  const response = await lab.request({
    schema: AGENT_COMMONS_READONLY_REQUEST_SCHEMA,
    id: `conformance-${index + 1}`,
    method,
    params: {}
  });
  validateAgentCommonsReadonlyResponse(response);
  responses.push({ method, digest: response.digest });
}

process.stdout.write(`${JSON.stringify({
  valid: true,
  schema: lab.schema,
  transport: 'none',
  network_listener: false,
  public_state_only: true,
  authority_granted: false,
  compatibility_claimed: false,
  methods: responses
}, null, 2)}\n`);
