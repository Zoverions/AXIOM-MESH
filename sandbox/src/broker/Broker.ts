import * as crypto from 'crypto';

export interface CapsuleManifest {
    id: string;
    scopes: string[];
    allowedHostcalls: string[];
    minimumTier?: string;
    version?: string;
    signature: string;
    signer: string;
}

export interface ExecutionToken {
    capsuleId: string;
    scopes: string[];
    resourceBudgets: Record<string, number>;
    signature: string;
    signer: string;
    expiresAt: number;
}

export interface PolicyRule {
    allowedScopes: string[];
    blockedHostcalls: string[];
    enforceRedaction: boolean;
    hardwareTiers: string[];
}

export interface AuditLog {
    timestamp: number;
    capsuleId: string;
    event: 'EXECUTION_START' | 'EXECUTION_BLOCKED' | 'HOSTCALL_BLOCKED' | 'HOSTCALL_ALLOWED' | 'EXECUTION_SUCCESS' | 'POLICY_UPDATE';
    details: any;
    signature?: string;
}

export interface Attestation {
    attestationId: string;
    capsuleId: string;
    logHash: string;
    hardwareTier: string;
    signature: string;
    timestamp: number;
    teeQuote?: string;
    zkProof?: string;
}

export class PolicyAttestationBroker {
    private nodePrivateKey: crypto.KeyObject;
    private nodePublicKey: crypto.KeyObject;
    private currentPolicy: PolicyRule;
    private hardwareTier: string;
    public auditLogs: AuditLog[] = [];
    private hostcallCounts: Record<string, number> = {};

    constructor(
        privateKeyPem: string,
        publicKeyPem: string,
        initialPolicy: PolicyRule,
        hardwareTier: string = 'standard'
    ) {
        this.nodePrivateKey = crypto.createPrivateKey(privateKeyPem);
        this.nodePublicKey = crypto.createPublicKey(publicKeyPem);
        this.currentPolicy = initialPolicy;
        this.hardwareTier = hardwareTier;
    }

    /**
     * Pre-execution checks: validate token signature, capsule manifest, hardware tier.
     */
    public validatePreExecution(token: ExecutionToken, manifest: CapsuleManifest): boolean {
        // 0. Enforce presence of new security fields
        if (!manifest.signature || !manifest.signer) {
            this.logAudit(token.capsuleId, 'EXECUTION_BLOCKED', { reason: 'Missing signature or signer in manifest' });
            throw new Error('Missing signature or signer in manifest');
        }
        if (!token.resourceBudgets) {
            this.logAudit(token.capsuleId, 'EXECUTION_BLOCKED', { reason: 'Missing resourceBudgets in token' });
            throw new Error('Missing resourceBudgets in token');
        }

        // 1. Check expiration
        if (Date.now() > token.expiresAt) {
            this.logAudit(token.capsuleId, 'EXECUTION_BLOCKED', { reason: 'Token expired' });
            throw new Error('Token expired');
        }

        // 2. Check capsule ID match (constant-time comparison)
        const tIdBuf = Buffer.from(token.capsuleId);
        const mIdBuf = Buffer.from(manifest.id);
        if (tIdBuf.length !== mIdBuf.length || !crypto.timingSafeEqual(tIdBuf, mIdBuf)) {
            this.logAudit(token.capsuleId, 'EXECUTION_BLOCKED', { reason: 'Capsule ID mismatch' });
            throw new Error('Capsule ID mismatch');
        }

        // 3. Hardware tier check
        if (manifest.minimumTier && !this.currentPolicy.hardwareTiers.includes(this.hardwareTier)) {
            this.logAudit(token.capsuleId, 'EXECUTION_BLOCKED', { reason: 'Insufficient hardware tier' });
            throw new Error('Insufficient hardware tier');
        }

        // 4. Verify Token Signature (Assuming signer is a public key or verifiable identity)
        // For demonstration, we just verify the signature over the capsuleId + scopes + expiresAt using the signer's public key
        const dataToVerify = `${token.capsuleId}:${token.scopes.join(',')}:${token.expiresAt}`;
        try {
            const signerKey = crypto.createPublicKey(token.signer);
            const verify = crypto.createVerify('SHA256');
            verify.update(dataToVerify);
            verify.end();
            const isValid = verify.verify(signerKey, Buffer.from(token.signature, 'hex'));
            if (!isValid) {
                this.logAudit(token.capsuleId, 'EXECUTION_BLOCKED', { reason: 'Invalid token signature' });
                throw new Error('Invalid token signature');
            }
        } catch (e) {
            this.logAudit(token.capsuleId, 'EXECUTION_BLOCKED', { reason: 'Signature verification failed' });
            throw new Error('Signature verification failed');
        }

        // 5. Check requested scopes against token scopes
        const unauthorizedTokenScopes = manifest.scopes.filter(s => !token.scopes.includes(s));
        if (unauthorizedTokenScopes.length > 0) {
            this.logAudit(token.capsuleId, 'EXECUTION_BLOCKED', { reason: `Manifest requests scopes not granted by token: ${unauthorizedTokenScopes.join(', ')}` });
            throw new Error(`Manifest requests scopes not granted by token: ${unauthorizedTokenScopes.join(', ')}`);
        }

        // 6. Check requested scopes against node policy
        const unauthorizedNodeScopes = manifest.scopes.filter(s => !this.currentPolicy.allowedScopes.includes(s));
        if (unauthorizedNodeScopes.length > 0) {
            this.logAudit(token.capsuleId, 'EXECUTION_BLOCKED', { reason: `Disallowed scopes requested by node policy: ${unauthorizedNodeScopes.join(', ')}` });
            throw new Error(`Disallowed scopes requested by node policy: ${unauthorizedNodeScopes.join(', ')}`);
        }

        this.logAudit(token.capsuleId, 'EXECUTION_START', { message: 'Pre-execution checks passed' });
        return true;
    }

    /**
     * Redaction enforcement: run local pre-processor to remove/replace disallowed fields
     */
    public redactData(input: Record<string, any>): Record<string, any> {
        if (!this.currentPolicy.enforceRedaction) {
            return structuredClone(input);
        }

        const redacted = structuredClone(input);
        // Deep clone or recursive redact could be used here
        // Simple top-level field removal for demonstration
        const sensitiveFields = ['rawLocalFiles', 'personalId', 'authTokens'];
        for (const field of sensitiveFields) {
            if (field in redacted) {
                redacted[field] = '[REDACTED]';
            }
        }

        // Deep redacting `activeTabContent` string matching
        const redactDeep = (obj: any) => {
           for(let key in obj) {
               if (key === 'activeTabContent') {
                   obj[key] = '[FEATURE_VECTOR_OR_ENCRYPTED_BLOB]';
               } else if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
                   obj[key] = '[REDACTED]';
               } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                   redactDeep(obj[key]);
               }
           }
        };

        redactDeep(redacted);

        return redacted;
    }

    /**
     * Sandbox orchestration hostcall mediation
     */
    public requestHostcall(capsuleId: string, manifest: CapsuleManifest, callName: string, args: any[]): boolean {
        // 0. Hostcall rate limiting & noise injection for side-channel mitigation
        const callKey = `${capsuleId}:${callName}`;
        this.hostcallCounts[callKey] = (this.hostcallCounts[callKey] || 0) + 1;
        if (this.hostcallCounts[callKey] > 100) {
            this.logAudit(capsuleId, 'HOSTCALL_BLOCKED', { call: callName, reason: 'Rate limit exceeded' });
            throw new Error(`Hostcall ${callName} rate limit exceeded`);
        }

        // Inject noise (dummy loop) for constant-time-ish side-channel mitigation
        let noise = 0;
        for (let i = 0; i < 1000; i++) {
            noise += Math.random();
        }

        // 1. Is it blocked by node policy?
        if (this.currentPolicy.blockedHostcalls.includes(callName)) {
            this.logAudit(capsuleId, 'HOSTCALL_BLOCKED', { call: callName, reason: 'Blocked by local policy' });
            throw new Error(`Hostcall ${callName} blocked by local policy`);
        }

        // 2. Is it allowed by the capsule manifest?
        if (!manifest.allowedHostcalls.includes(callName)) {
            this.logAudit(capsuleId, 'HOSTCALL_BLOCKED', { call: callName, reason: 'Not whitelisted in manifest' });
            throw new Error(`Hostcall ${callName} not whitelisted in manifest`);
        }

        // 3. Specific hardcoded dangerous hostcalls check
        if (callName === 'fs_read' || callName === 'tab_read' || callName === 'exfiltrate_raw') {
            // Check arguments for sensitive paths
            const path = args[0];
            if (typeof path === 'string' && (path.includes('/etc/shadow') || path.includes('/root') || path.includes('activeTab'))) {
                 this.logAudit(capsuleId, 'HOSTCALL_BLOCKED', { call: callName, reason: 'Attempted to access sensitive path/content' });
                 throw new Error(`Unauthorized I/O access to sensitive path`);
            }
        }

        this.logAudit(capsuleId, 'HOSTCALL_ALLOWED', { call: callName });
        return true;
    }

    /**
     * Update policy with governance signature
     */
    public updatePolicy(rawPolicyString: string, signatures: string[], governancePubKeyPems: string[], threshold: number = 2): boolean {
        try {
            let validSignatures = 0;

            for (let i = 0; i < signatures.length; i++) {
                if (i >= governancePubKeyPems.length) break;

                const govKey = crypto.createPublicKey(governancePubKeyPems[i]);
                const verify = crypto.createVerify('SHA256');
                verify.update(rawPolicyString);
                verify.end();
                const isValid = verify.verify(govKey, Buffer.from(signatures[i], 'hex'));

                if (isValid) {
                    validSignatures++;
                }
            }

            if (validSignatures < threshold) {
                this.logAudit('SYSTEM', 'POLICY_UPDATE', { status: 'FAILED', reason: `Insufficient valid signatures: ${validSignatures}/${threshold}` });
                throw new Error(`Governance signature verification failed: threshold not met`);
            }

            const newPolicy = JSON.parse(rawPolicyString) as PolicyRule;
            this.currentPolicy = newPolicy;
            this.logAudit('SYSTEM', 'POLICY_UPDATE', { status: 'SUCCESS', newPolicy });
            return true;
        } catch (e: any) {
            this.logAudit('SYSTEM', 'POLICY_UPDATE', { status: 'FAILED', reason: 'Signature verification failed' });
            throw new Error(e.message || 'Governance signature verification failed');
        }
    }

    /**
     * Produce tamper-evident logs signed by node key
     */
    private logAudit(capsuleId: string, event: AuditLog['event'], details: any): void {
        const logEntry: AuditLog = {
            timestamp: Date.now(),
            capsuleId,
            event,
            details
        };

        const sign = crypto.createSign('SHA256');
        sign.update(JSON.stringify({ timestamp: logEntry.timestamp, capsuleId: logEntry.capsuleId, event: logEntry.event, details: logEntry.details }));
        sign.end();
        logEntry.signature = sign.sign(this.nodePrivateKey, 'hex');

        this.auditLogs.push(logEntry);
    }

    public getAuditLogs(): AuditLog[] {
        return this.auditLogs;
    }

    /**
     * Generate optional zk/TEE attestations for outputs
     */
    public generateAttestation(capsuleId: string, outputData: any, isHighSensitivity: boolean = false): Attestation {
        const hash = crypto.createHash('sha256');
        hash.update(JSON.stringify(outputData));
        const outputHash = hash.digest('hex');

        // Include recent logs hash for tamper-evidence
        const recentLogs = this.auditLogs.filter(l => l.capsuleId === capsuleId);
        const logHashCalc = crypto.createHash('sha256');
        logHashCalc.update(JSON.stringify(recentLogs));
        const logHash = logHashCalc.digest('hex');

        const timestamp = Date.now();
        const attestationData = `${capsuleId}:${outputHash}:${logHash}:${this.hardwareTier}:${timestamp}`;

        const sign = crypto.createSign('SHA256');
        sign.update(attestationData);
        sign.end();
        const signature = sign.sign(this.nodePrivateKey, 'hex');

        const attestation: Attestation = {
            attestationId: crypto.randomUUID(),
            capsuleId,
            logHash,
            hardwareTier: this.hardwareTier,
            signature,
            timestamp
        };

        if (isHighSensitivity) {
            attestation.teeQuote = Buffer.from(`MOCK_TEE_QUOTE_${capsuleId}_${timestamp}`).toString('base64');
            attestation.zkProof = Buffer.from(`MOCK_ZK_PROOF_${capsuleId}_${timestamp}`).toString('base64');
        }

        return attestation;
    }

    /**
     * Mock Sandbox orchestration entry point
     */
    public orchestrateExecution(token: ExecutionToken, manifest: CapsuleManifest, inputData: any, isHighSensitivity: boolean = false, mockExecutionFn: (redactedInput: any) => any): any {
        // 1. Pre-execution checks
        this.validatePreExecution(token, manifest);

        // 2. Redaction
        const redactedInput = this.redactData(inputData);

        // 3. Execute (WASM/OCI mock)
        let output;
        try {
            // Note: The mock execution function should call requestHostcall as needed
            output = mockExecutionFn(redactedInput);
            this.logAudit(manifest.id, 'EXECUTION_SUCCESS', { outputHash: crypto.createHash('sha256').update(JSON.stringify(output)).digest('hex') });
        } catch (e: any) {
             this.logAudit(manifest.id, 'EXECUTION_BLOCKED', { reason: `Execution failed: ${e.message}` });
             throw e;
        }

        // 4. Generate attestation
        const attestation = this.generateAttestation(manifest.id, output, isHighSensitivity);

        return {
            output,
            attestation,
            auditLogs: this.getAuditLogs().filter(l => l.capsuleId === manifest.id)
        };
    }
}
