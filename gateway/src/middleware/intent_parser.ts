import { sanitizeContent } from '../utils/sanitize';

export type ParsedIntent = {
    id?: string;
    session_id?: string;
    conversation_id?: string;
    actor_id?: string;
    identity_hash?: string;
    modality?: string;
    consent_scope?: 'allowed' | 'context_only' | 'revoked';
    input: string;
    timestamp?: number;
};

import { CryptoWorkerPool } from '../performance/EventLoopOptimizer';
import { MCPFirewall, MCPSecurityPolicy } from '../security/MCPFirewall';

const workerPool = new CryptoWorkerPool(2);

const policy: MCPSecurityPolicy = {
  toolValidation: {
    schemaStrictness: 'strict',
    maxToolDescriptionLength: 1000,
    prohibitedPatterns: [/<script>/i, /eval\(/i],
    requiredAnnotations: []
  },
  identityChain: {
    userTokenExchange: true,
    workloadIdentity: 'mTLS',
    sessionBinding: true
  },
  inputSanitization: {
    maxPromptLength: 8192,
    delimiterEnforcement: true,
    instructionBoundaryMarkers: [],
    semanticAnalysis: false
  }
};

const mcpFirewall = new MCPFirewall(policy, ['sandbox_execute', 'register_grid_skill']);

export async function parseAndSanitizeIntent(rawJson: string): Promise<ParsedIntent> {
    // Offload JSON parsing and Zod validation to worker thread
    const parsed = await workerPool.validateAndParse(rawJson);

    // Run MCP Firewall checks if tools are specified
    if (parsed.payload && parsed.payload.tool) {
       const userContext = { userId: parsed.actor_id || "anonymous", role: "user" };
       const validResult = mcpFirewall.validateToolCall(parsed.payload.tool, parsed.payload.params, userContext);
       if (!validResult.valid) {
          throw new Error(`MCP Firewall blocked intent: ${validResult.reason}`);
       }
    }

    // NOTE: This is payload hygiene, not a full application firewall.
    parsed.input = sanitizeContent(parsed.input);

    return parsed;
}
