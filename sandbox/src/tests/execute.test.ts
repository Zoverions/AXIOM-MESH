import request from 'supertest';
import express from 'express';
import executeRouter from '../routes/execute';
import * as auth from '../utils/auth';
import * as dockerRunner from '../services/dockerRunner';
import * as secureRuntime from '../execution/SecureRuntime';

jest.mock('../utils/auth');
jest.mock('../services/dockerRunner');
jest.mock('../execution/SecureRuntime');
// We need to mock node-fetch conditionally but it's dynamic import in the code.
// We can mock it by intercepting the global fetch or the specific module.

const app = express();
app.use(express.json());
app.use(executeRouter);

describe('Execute Router Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (auth.validateSandboxApiKey as jest.Mock).mockResolvedValue({ ok: true });

        // Mock SecureRuntime methods
        secureRuntime.NetworkNamespaceController.prototype.isolateProcess = jest.fn().mockResolvedValue(true);
        secureRuntime.NetworkNamespaceController.prototype.restoreNetworking = jest.fn().mockResolvedValue(true);
    });

    test('GET /health returns status ok', async () => {
        const response = await request(app).get('/health');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            status: 'ok',
            component: 'execution-sandbox',
            dependencies: { docker: 'ok' }
        });
    });

    test('POST /execute returns auth error if validation fails', async () => {
        (auth.validateSandboxApiKey as jest.Mock).mockResolvedValue({ ok: false, code: 401, error: 'Unauthorized' });
        const response = await request(app).post('/execute').send({});
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Unauthorized' });
    });

    test('POST /execute requires language and code', async () => {
        const response = await request(app).post('/execute').send({ language: 'python' });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Language and code must be non-empty strings' });
    });

    test('POST /execute validates language format', async () => {
        const response = await request(app).post('/execute').send({ language: 'pyth@on!', code: 'print()' });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Invalid language format' });
    });

    test('POST /execute limits language length', async () => {
        const response = await request(app).post('/execute').send({ language: 'a'.repeat(51), code: 'print()' });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Language parameter exceeds maximum length' });
    });

    test('POST /execute limits code length', async () => {
        const response = await request(app).post('/execute').send({ language: 'python', code: 'a'.repeat(100001) });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Code parameter exceeds maximum length limit' });
    });

    test('POST /execute executes code successfully', async () => {
        (dockerRunner.runCode as jest.Mock).mockResolvedValue('Hello World');
        const response = await request(app).post('/execute').send({ language: 'python', code: 'print("Hello World")' });
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ result: 'Hello World' });
        expect(dockerRunner.runCode).toHaveBeenCalledWith('python', 'print("Hello World")', false);
    });

    test('POST /execute blocks high-risk code without proofs', async () => {
        const response = await request(app).post('/execute').send({ language: 'python', code: 'import requests' });
        expect(response.status).toBe(403);
        expect(response.body.error).toContain('Firewall Blocked');
    });

    // We mock node-fetch globally since jest.doMock inside tests can be tricky with ES imports
});
