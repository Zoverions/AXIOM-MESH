import request from 'supertest';
import { app } from '../index';
import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';

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

    function getAuthHeaders(payloadStr: string, key: string = 'test-sandbox-key') {
        const timestampStr = Date.now().toString();
        const nonce = 'test-nonce-' + Math.random().toString(36).substring(7);
        const hmac = crypto.createHmac('sha256', key);
        hmac.update(`${timestampStr}:${nonce}:${payloadStr}`);
        return {
            'x-axiom-timestamp': timestampStr,
            'x-axiom-nonce': nonce,
            'x-axiom-signature': hmac.digest('hex')
        };
    }

    it('should successfully stub python code execution', async () => {
        const originalKey = process.env.SANDBOX_API_KEY;
        process.env.SANDBOX_API_KEY = 'test-sandbox-key';

        const payloadObj = { language: 'python', code: 'print("Hello")' };
        const payloadStr = stringify(payloadObj);

        const res = await request(app)
            .post('/execute')
            .set(getAuthHeaders(payloadStr))
            .set('Content-Type', 'application/json')
            .send(payloadStr);

        expect(res.status).toBe(200);
        expect(res.body.result.stdout).toContain('Integration Sandbox Stub Response');

        process.env.SANDBOX_API_KEY = originalKey;
    });

    it('should fail with 403 when Authorization header is missing', async () => {
        const payloadObj = { language: 'python', code: 'print("Hello")' };
        const payloadStr = stringify(payloadObj);

        const res = await request(app)
            .post('/execute')
            .set('Content-Type', 'application/json')
            .send(payloadStr);

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Forbidden: Missing required signature headers');
    });

    it('should fail with 403 when Authorization header is invalid', async () => {
        const payloadObj = { language: 'python', code: 'print("Hello")' };
        const payloadStr = stringify(payloadObj);

        const res = await request(app)
            .post('/execute')
            .set(getAuthHeaders(payloadStr, 'wrong-key'))
            .set('Content-Type', 'application/json')
            .send(payloadStr);

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Forbidden: Invalid request signature');
    });

    it('should fail with 500 when SANDBOX_API_KEY is not configured', async () => {
        delete process.env.SANDBOX_API_KEY;

        const payloadObj = { language: 'python', code: 'print("Hello")' };
        const payloadStr = stringify(payloadObj);

        const res = await request(app)
            .post('/execute')
            .set(getAuthHeaders(payloadStr))
            .set('Content-Type', 'application/json')
            .send(payloadStr);

        expect(res.status).toBe(500);
        expect(res.body.error).toContain('Server configuration error: SANDBOX_API_KEY is not set');

        process.env.SANDBOX_API_KEY = 'test-sandbox-key';
    });
});
