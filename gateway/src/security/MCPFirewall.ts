import * as acorn from 'acorn';

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

import * as crypto from 'crypto';

export class MCPFirewall {
  private policy: MCPSecurityPolicy;
  private allowlist: Set<string>;

  private rateLimits: Map<string, { count: number; timestamp: number }> = new Map();
  private pendingApprovals: Map<string, { toolCall: ToolCall; timestamp: number }> = new Map();

  private cleanupInterval: NodeJS.Timeout;

  constructor(policy: MCPSecurityPolicy, allowlist: string[]) {
    this.policy = policy;
    this.allowlist = new Set(allowlist);

    // Start background cleanup for memory leak prevention
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  // Periodic cleanup to prevent OOM
  private cleanup() {
    const now = Date.now();
    // Clean rate limits older than 1 minute
    for (const [key, record] of this.rateLimits.entries()) {
      if (now - record.timestamp > 60000) {
        this.rateLimits.delete(key);
      }
    }
    // Clean pending approvals older than 15 minutes
    for (const [key, record] of this.pendingApprovals.entries()) {
      if (now - record.timestamp > 15 * 60000) {
        this.pendingApprovals.delete(key);
      }
    }
  }

  // Graceful shutdown
  public destroy() {
    clearInterval(this.cleanupInterval);
  }

  // Implement tool call validation with AST analysis
  validateToolCall(toolName: string, params: any, userContext: UserContext): ValidationResult {
    // 1. Check tool against allowlist (not blocklist)
    if (!this.allowlist.has(toolName)) {
      return { valid: false, reason: `Tool ${toolName} is not in the allowlist` };
    }

    // 2. Validate parameter schema with additional constraints
    const paramsString = typeof params === 'string' ? params : JSON.stringify(params);
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

    // AST Analysis for Tool Validation
    if (params && typeof params.code === 'string') {
      try {
        const ast = acorn.parse(params.code, { ecmaVersion: 2020 });
        let hasRestricted = false;

        // Simple recursive AST walker to detect eval or nested tool execution
        const walk = (node: any) => {
          if (!node) return;
          if (node.type === 'CallExpression') {
            if (node.callee.type === 'Identifier' && node.callee.name === 'eval') {
              hasRestricted = true;
            }
          }
          for (const key in node) {
            if (node[key] && typeof node[key] === 'object') {
              walk(node[key]);
            }
          }
        };

        walk(ast);
        if (hasRestricted) {
           return { valid: false, reason: "AST validation failed: prohibited syntax detected" };
        }
      } catch (err) {
        return { valid: false, reason: "AST validation failed: invalid code syntax" };
      }
    }

    // Prompt injection defenses
    if (this.policy.inputSanitization.delimiterEnforcement) {
        for (const marker of this.policy.inputSanitization.instructionBoundaryMarkers) {
           // Enforce proper presence/absence of markers based on specific logic
           // For simplicity, we ensure no unauthorized system prompt boundaries are embedded
           if (paramsString.includes(marker)) {
              return { valid: false, reason: "Prompt injection defense triggered: unauthorized boundary marker detected" };
           }
        }
    }

    // Strict Schema Validation
    if (this.policy.toolValidation.schemaStrictness === 'strict') {
         // Ensure annotations exist
         for (const annotation of this.policy.toolValidation.requiredAnnotations) {
             if (!paramsString.includes(annotation)) {
                 return { valid: false, reason: `Strict schema validation failed: missing annotation ${annotation}` };
             }
         }
    }

    if (!toolName || !userContext) {
      return { valid: false, reason: "Missing toolName or userContext" };
    }

    // 4. Rate limit per-user per-tool
    const rateLimitKey = `${userContext.userId}:${toolName}`;
    const now = Date.now();
    const windowMs = 60000; // 1 minute window

    const limitRecord = this.rateLimits.get(rateLimitKey);
    if (limitRecord && now - limitRecord.timestamp < windowMs) {
      if (limitRecord.count >= 100) {
        return { valid: false, reason: "Rate limit exceeded for tool" };
      }
      limitRecord.count++;
      this.rateLimits.set(rateLimitKey, limitRecord);
    } else {
      this.rateLimits.set(rateLimitKey, { count: 1, timestamp: now });
    }

    return { valid: true };
  }

  // Code-signing verification for MCP servers
  validateMCPServerRegistration(serverDid: string, signature: string, payload: any): boolean {
    if (!signature || signature.length < 32 || !serverDid.startsWith('did:key:')) {
        return false;
    }

    try {
        const crypto = require('crypto');

        // Extract public key from did:key: format
        const pubKeyHex = serverDid.replace('did:key:', '');

        // Convert to a proper PEM format string to use with crypto.verify
        // This is a naive DER/PEM construction for a raw public key in hex
        // In a full implementation, you'd use a multibase library to decode it
        // and format it according to its key type.
        const pemHeader = '-----BEGIN PUBLIC KEY-----\n';
        const pemFooter = '\n-----END PUBLIC KEY-----';

        let derKey;
        try {
            // Add ASN.1 SubjectPublicKeyInfo OID prefix for Ed25519 (or secp256k1)
            // 302a300506032b6570032100 is the standard Ed25519 prefix for a 32-byte key
            const prefix = '302a300506032b6570032100';
            const fullHex = prefix + pubKeyHex;
            derKey = Buffer.from(fullHex, 'hex').toString('base64');
            // Format to 64 chars per line
            derKey = derKey.match(/.{1,64}/g)?.join('\n') || derKey;
        } catch (e) {
            return false;
        }

        const publicKey = pemHeader + derKey + pemFooter;

        const verify = crypto.createVerify('SHA256');
        verify.update(JSON.stringify(payload));
        verify.end();

        return verify.verify(publicKey, Buffer.from(signature, 'hex'));
    } catch (err) {
        console.error('Crypto verification failed:', err);
        return false;
    }
  }

  // Implement human-in-the-loop for high-risk operations
  async requireExplicitApproval(toolCall: ToolCall, riskScore: number): Promise<boolean> {
    // Risk > 0.7 requires explicit user confirmation
    // Risk > 0.9 requires second-factor authentication
    if (riskScore > 0.9 || riskScore > 0.7) {
      const approvalId = crypto.randomUUID();
      this.pendingApprovals.set(approvalId, {
        toolCall,
        timestamp: Date.now()
      });
      console.log(`High risk score (${riskScore}) detected. Approval required. ID: ${approvalId}`);
      // Return false indicating confirmation or 2FA is required and not yet provided
      return false;
    }
    return true;
  }
}
