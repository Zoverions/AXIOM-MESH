import {
    PolicyAttestationBroker,
    PolicyRule,
    ExecutionToken,
    CapsuleManifest
} from './Broker';
import * as crypto from 'crypto';

describe('PolicyAttestationBroker', () => {
    let broker: PolicyAttestationBroker;
    let nodeKeyPair: any;
    let userKeyPair: any;
    let govKeyPair1: any;
    let govKeyPair2: any;
    let govKeyPair3: any;

    const initialPolicy: PolicyRule = {
        allowedScopes: ['network.read', 'fs.read.tmp', 'compute'],
        blockedHostcalls: ['os_exec', 'fs_write_root'],
        enforceRedaction: true,
        hardwareTiers: ['standard', 'high_end']
    };

    beforeAll(() => {
        nodeKeyPair = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        userKeyPair = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        govKeyPair1 = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        govKeyPair2 = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        govKeyPair3 = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
    });

    beforeEach(() => {
        broker = new PolicyAttestationBroker(
            nodeKeyPair.privateKey,
            nodeKeyPair.publicKey,
            { ...initialPolicy },
            'standard'
        );
    });

    const createValidToken = (capsuleId: string, scopes: string[]): ExecutionToken => {
        const expiresAt = Date.now() + 10000;
        const dataToSign = `${capsuleId}:${scopes.join(',')}:${expiresAt}`;
        const sign = crypto.createSign('SHA256');
        sign.update(dataToSign);
        sign.end();
        const signature = sign.sign(userKeyPair.privateKey, 'hex');

        return {
            capsuleId,
            scopes,
            resourceBudgets: { memory: 128 },
            signature,
            signer: userKeyPair.publicKey,
            expiresAt
        };
    };

    const validManifest: CapsuleManifest = {
        id: 'capsule-123',
        scopes: ['compute'],
        allowedHostcalls: ['fs_read_tmp', 'math_add'],
        minimumTier: 'standard',
        signature: 'mock_signature',
        signer: 'mock_signer'
    };

    describe('Pre-execution checks', () => {
        it('should pass valid token and manifest', () => {
            const token = createValidToken('capsule-123', ['compute']);
            expect(broker.validatePreExecution(token, validManifest)).toBe(true);
        });

        it('should block expired token', () => {
            const token = createValidToken('capsule-123', ['compute']);
            token.expiresAt = Date.now() - 1000; // expired
            expect(() => broker.validatePreExecution(token, validManifest)).toThrow('Token expired');
        });

        it('should block mismatched capsule ID', () => {
            const token = createValidToken('wrong-id', ['compute']);
            expect(() => broker.validatePreExecution(token, validManifest)).toThrow('Capsule ID mismatch');
        });

        it('should block scopes requested by manifest but not granted by token', () => {
            const manifest: CapsuleManifest = { ...validManifest, scopes: ['compute', 'network.read'] };
            const token = createValidToken('capsule-123', ['compute']);
            expect(() => broker.validatePreExecution(token, manifest)).toThrow('Manifest requests scopes not granted by token: network.read');
        });

        it('should block disallowed scopes requested by node policy', () => {
            const manifest: CapsuleManifest = { ...validManifest, scopes: ['admin.root'] };
            const token = createValidToken('capsule-123', ['admin.root']);
            expect(() => broker.validatePreExecution(token, manifest)).toThrow('Disallowed scopes requested by node policy: admin.root');
        });
    });

    describe('Redaction enforcement', () => {
        it('should redact sensitive top-level fields', () => {
            const input = {
                data: 'hello',
                activeTabContent: 'secret info',
                rawLocalFiles: ['/etc/passwd']
            };
            const redacted = broker.redactData(input);
            expect(redacted.activeTabContent).toBe('[FEATURE_VECTOR_OR_ENCRYPTED_BLOB]');
            expect(redacted.rawLocalFiles).toBe('[REDACTED]');
            expect(redacted.data).toBe('hello');
        });

        it('should redact deep sensitive fields even if they are objects', () => {
            const input = {
                nested: {
                    passwordField: { deepObject: 'mySecretPass' },
                    activeTabContent: ['array', 'of', 'secrets'],
                    normal: 'text'
                }
            };
            const redacted = broker.redactData(input);
            expect(redacted.nested.passwordField).toBe('[REDACTED]');
            expect(redacted.nested.activeTabContent).toBe('[FEATURE_VECTOR_OR_ENCRYPTED_BLOB]');
            expect(redacted.nested.normal).toBe('text');
        });
    });

    describe('Sandbox orchestration & Hostcall Fuzzing', () => {
        it('should allow whitelisted hostcalls', () => {
            expect(broker.requestHostcall('capsule-123', validManifest, 'math_add', [1, 2])).toBe(true);
            const logs = broker.getAuditLogs();
            expect(logs[logs.length - 1].event).toBe('HOSTCALL_ALLOWED');
        });

        it('should block hostcalls not in manifest', () => {
            expect(() => broker.requestHostcall('capsule-123', validManifest, 'unknown_call', []))
                .toThrow('Hostcall unknown_call not whitelisted in manifest');
            const logs = broker.getAuditLogs();
            expect(logs[logs.length - 1].event).toBe('HOSTCALL_BLOCKED');
        });

        it('should block unauthorized I/O access to raw local files', () => {
            const manifestWithRead = { ...validManifest, allowedHostcalls: ['fs_read'] };
            expect(() => broker.requestHostcall('capsule-123', manifestWithRead, 'fs_read', ['/etc/shadow']))
                .toThrow('Unauthorized I/O access to sensitive path');
        });

        it('should execute successfully and return attestation', () => {
            const token = createValidToken('capsule-123', ['compute']);
            const input = { data: 'test', activeTabContent: 'secret' };

            const mockExecutionFn = (redacted: any) => {
                // Ensure redaction worked inside mock execution
                expect(redacted.activeTabContent).toBe('[FEATURE_VECTOR_OR_ENCRYPTED_BLOB]');
                return { result: 'success' };
            };

            const result = broker.orchestrateExecution(token, validManifest, input, false, mockExecutionFn);
            expect(result.output.result).toBe('success');
            expect(result.attestation.capsuleId).toBe('capsule-123');
            expect(result.attestation.signature).toBeDefined();

            const logs = broker.getAuditLogs();
            const successLog = logs.find(l => l.event === 'EXECUTION_SUCCESS');
            expect(successLog).toBeDefined();
        });
    });

    describe('Policy updates', () => {
        it('should accept signed policy updates from governance threshold', () => {
            const newPolicy: PolicyRule = {
                allowedScopes: ['all'],
                blockedHostcalls: [],
                enforceRedaction: false,
                hardwareTiers: ['standard']
            };

            const rawPolicyString = JSON.stringify(newPolicy);

            const sign1 = crypto.createSign('SHA256');
            sign1.update(rawPolicyString);
            sign1.end();
            const signature1 = sign1.sign(govKeyPair1.privateKey, 'hex');

            const sign2 = crypto.createSign('SHA256');
            sign2.update(rawPolicyString);
            sign2.end();
            const signature2 = sign2.sign(govKeyPair2.privateKey, 'hex');

            const pubKeys = [govKeyPair1.publicKey, govKeyPair2.publicKey, govKeyPair3.publicKey];
            const signatures = [signature1, signature2]; // 2 valid signatures, threshold is 2

            expect(broker.updatePolicy(rawPolicyString, signatures, pubKeys, 2)).toBe(true);

            // Redaction should now be disabled
            const input = { activeTabContent: 'secret' };
            const redacted = broker.redactData(input);
            expect(redacted.activeTabContent).toBe('secret');
        });

        it('should reject when threshold is not met for policy updates', () => {
            const newPolicy: PolicyRule = {
                allowedScopes: ['all'],
                blockedHostcalls: [],
                enforceRedaction: false,
                hardwareTiers: ['standard']
            };

            const rawPolicyString = JSON.stringify(newPolicy);

            const sign1 = crypto.createSign('SHA256');
            sign1.update(rawPolicyString);
            sign1.end();
            const signature1 = sign1.sign(govKeyPair1.privateKey, 'hex');

            // Second signature is invalid (signed by user key)
            const signBad = crypto.createSign('SHA256');
            signBad.update(rawPolicyString);
            signBad.end();
            const signatureBad = signBad.sign(userKeyPair.privateKey, 'hex');

            const pubKeys = [govKeyPair1.publicKey, govKeyPair2.publicKey, govKeyPair3.publicKey];
            const signatures = [signature1, signatureBad]; // Only 1 valid signature

            expect(() => broker.updatePolicy(rawPolicyString, signatures, pubKeys, 2)).toThrow('Governance signature verification failed: threshold not met');
        });
    });
});
