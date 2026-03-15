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
        const res = await request(app)
            .post('/execute')
            .send({ language: 'python', code: 'print("Hello")' });

        expect(res.status).toBe(200);
        expect(res.body.result.stdout).toContain('Integration Sandbox Stub Response');
    });
});
