import request from 'supertest';
import { app } from '../index';

jest.mock('child_process', () => {
    const EventEmitter = require('events');
    return {
        spawn: jest.fn().mockImplementation(() => {
            const child: any = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();

            setTimeout(() => {
                child.stdout.emit('data', Buffer.from('Integration Sandbox Stub Response\n'));
                child.emit('close', 0);
            }, 50);

            return child;
        })
    };
});

describe('Sandbox Integration Endpoint', () => {
    beforeAll(() => {
        process.env.SANDBOX_API_KEY = 'test-sandbox-key';
    });

    afterAll(() => {
        delete process.env.SANDBOX_API_KEY;
    });

    it('should successfully stub python code execution', async () => {
        const res = await request(app)
            .post('/execute')
            .set('Authorization', 'Bearer test-sandbox-key')
            .send({ language: 'python', code: 'print("Hello")' });

        expect(res.status).toBe(200);
        expect(res.body.result.stdout).toContain('Integration Sandbox Stub Response');
    });

    it('should fail with 401 when Authorization header is missing', async () => {
        const res = await request(app)
            .post('/execute')
            .send({ language: 'python', code: 'print("Hello")' });

        expect(res.status).toBe(401);
        expect(res.body.error).toContain('Unauthorized: Missing or invalid Authorization header');
    });

    it('should fail with 403 when Authorization header is invalid', async () => {
        const res = await request(app)
            .post('/execute')
            .set('Authorization', 'Bearer wrong-key')
            .send({ language: 'python', code: 'print("Hello")' });

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Forbidden: Invalid API Key');
    });

    it('should fail with 500 when SANDBOX_API_KEY is not configured', async () => {
        delete process.env.SANDBOX_API_KEY;

        const res = await request(app)
            .post('/execute')
            .set('Authorization', 'Bearer anything')
            .send({ language: 'python', code: 'print("Hello")' });

        expect(res.status).toBe(500);
        expect(res.body.error).toContain('Server configuration error: SANDBOX_API_KEY is not set');

        // Restore for other tests just in case
        process.env.SANDBOX_API_KEY = 'test-sandbox-key';
    });
});
