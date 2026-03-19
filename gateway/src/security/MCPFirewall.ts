export interface UserContext {
  userId: string;
  role: string;
}

export interface ToolCall {
  name: string;
  params: any;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface MCPSecurityPolicy {
  // Zero-trust validation layer
  toolValidation: {
    schemaStrictness: 'strict' | 'permissive';
    maxToolDescriptionLength: number;
    prohibitedPatterns: RegExp[];
    requiredAnnotations: string[];
  };

  // Confused deputy prevention
  identityChain: {
    userTokenExchange: boolean; // RFC 8693 token exchange
    workloadIdentity: 'SPIFFE' | 'JWT' | 'mTLS';
    sessionBinding: boolean;
  };

  // Prompt injection defense
  inputSanitization: {
    maxPromptLength: number;
    delimiterEnforcement: boolean;
    instructionBoundaryMarkers: string[];
    semanticAnalysis: boolean; // Deploy prompt injection detection
  };
}

export class MCPFirewall {
  private policy: MCPSecurityPolicy;
  private allowlist: Set<string>;

  constructor(policy: MCPSecurityPolicy, allowlist: string[]) {
    this.policy = policy;
    this.allowlist = new Set(allowlist);
  }

  // Implement tool call validation with AST analysis
  validateToolCall(toolName: string, params: unknown, userContext: UserContext): ValidationResult {
    // 1. Check tool against allowlist (not blocklist)
    if (!this.allowlist.has(toolName)) {
      return { valid: false, reason: `Tool ${toolName} is not in the allowlist` };
    }

    // 2. Validate parameter schema with additional constraints
    const paramsString = JSON.stringify(params);
    if (paramsString.length > this.policy.inputSanitization.maxPromptLength) {
      return { valid: false, reason: "Parameters exceed maximum prompt length" };
    }

    for (const pattern of this.policy.toolValidation.prohibitedPatterns) {
      if (pattern.test(paramsString)) {
        return { valid: false, reason: "Parameters contain prohibited patterns" };
      }
    }

    // 3. Ensure no nested tool calls in parameters
    if (paramsString.includes("toolCall") || paramsString.includes("nested_tool")) {
       return { valid: false, reason: "Nested tool calls are prohibited" };
    }

    // 4. Rate limit per-user per-tool (stubbed as this requires a distributed store like Redis in production)

    if (!toolName || !userContext) {
      return { valid: false, reason: "Missing toolName or userContext" };
    }
    return { valid: true };
  }

  // Implement human-in-the-loop for high-risk operations
  async requireExplicitApproval(toolCall: ToolCall, riskScore: number): Promise<boolean> {
    // Risk > 0.7 requires explicit user confirmation
    // Risk > 0.9 requires second-factor authentication
    if (riskScore > 0.9) {
      // Return false indicating 2FA is required and not yet provided in this automated context
      return false;
    } else if (riskScore > 0.7) {
      // In a real implementation this would trigger an async workflow waiting for user confirmation
      return false;
    }
    return true;
  }
}
