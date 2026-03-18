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
    it('should successfully stub python code execution', async () => {
        const originalKey = process.env.SANDBOX_API_KEY;
        process.env.SANDBOX_API_KEY = 'test-sandbox-key';

        const res = await request(app)
            .post('/execute')
            .set('Authorization', 'Bearer test-sandbox-key')
            .send({ language: 'python', code: 'print("Hello")' });

        expect(res.status).toBe(200);
        expect(res.body.result.stdout).toContain('Integration Sandbox Stub Response');

        process.env.SANDBOX_API_KEY = originalKey;
    });
});
