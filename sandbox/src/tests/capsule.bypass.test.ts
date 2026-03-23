import request from 'supertest';
import express from 'express';
import capsuleRouter, { registry } from '../routes/capsule';

jest.mock('../utils/auth', () => ({
    validateSandboxApiKey: jest.fn().mockResolvedValue({ ok: true })
}));

jest.mock('../services/dockerRunner', () => ({
    runCode: jest.fn().mockResolvedValue('success output')
}));

const app = express();
app.use(express.json());
app.use('/', capsuleRouter);

describe('Capsule Security Bypasses', () => {
    beforeEach(() => {
        registry.clear();
        jest.clearAllMocks();
    });

    test('should reject capsule when signature is invalid, even if TEST_ALLOW_ALL_CAPSULES is previously expected to work', async () => {
        const payload = {
            manifest: {
                id: 'test-capsule-1',
                version: '1.0',
                entrypoint: 'python main.py',
                scopes: { resource_limits: { mem_mb: 128, cpu_ms: 1000 } },
                required_hardware_tier: 'standard',
                attestation_policy: 'strict'
            },
            binary_base64: 'ZHVtbXkgYmluYXJ5',
            signature: 'invalid-signature-data'
        };

        const response = await request(app)
            .post('/capsule/publish')
            .send(payload);

        expect(response.status).toBe(403);
        expect(response.body.error).toContain('Signature verification failed');
    });

    test('should allow bypass in non-production mode', async () => {
        process.env.TEST_ALLOW_ALL_CAPSULES = 'true';
        process.env.NODE_ENV = 'development';
        const payload = {
            manifest: {
                id: 'test-capsule-bypass',
                version: '1.0',
                entrypoint: 'python main.py',
                scopes: { resource_limits: { mem_mb: 128, cpu_ms: 1000 } },
                required_hardware_tier: 'standard',
                attestation_policy: 'strict'
            },
            binary_base64: 'ZHVtbXkgYmluYXJ5',
            signature: 'invalid-signature-data'
        };

        const response = await request(app)
            .post('/capsule/publish')
            .send(payload);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('published');
    });

    test('should ignore bypass in production mode', async () => {
        process.env.TEST_ALLOW_ALL_CAPSULES = 'true';
        process.env.NODE_ENV = 'production';
        const payload = {
            manifest: {
                id: 'test-capsule-no-bypass',
                version: '1.0',
                entrypoint: 'python main.py',
                scopes: { resource_limits: { mem_mb: 128, cpu_ms: 1000 } },
                required_hardware_tier: 'standard',
                attestation_policy: 'strict'
            },
            binary_base64: 'ZHVtbXkgYmluYXJ5',
            signature: 'invalid-signature-data'
        };

        const response = await request(app)
            .post('/capsule/publish')
            .send(payload);

        expect(response.status).toBe(403);
        expect(response.body.error).toContain('Signature verification failed');
    });
});
