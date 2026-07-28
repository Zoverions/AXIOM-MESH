import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import router from './mobile';

const app = express();
app.use(express.json());
app.use('/api/mobile', router);

describe('mobile auth + election flows', () => {
    const originalApiKey = process.env.GATEWAY_API_KEY;

    beforeEach(() => {
        process.env.GATEWAY_API_KEY = 'test-gateway-key';
    });

    afterAll(() => {
        process.env.GATEWAY_API_KEY = originalApiKey;
    });

    test('one-time QR login completes and is consumed once', async () => {
        const initResponse = await request(app)
            .post('/api/mobile/auth/qr/init')
            .set('x-api-key', 'test-gateway-key')
            .send({ walletAddress: '0xABCDEF' });

        expect(initResponse.status).toBe(200);
        expect(initResponse.body.sessionId).toBeDefined();
        expect(initResponse.body.oneTimeCode).toBeDefined();

        const sessionId = initResponse.body.sessionId as string;
        const oneTimeCode = initResponse.body.oneTimeCode as string;

        const completeResponse = await request(app)
            .post('/api/mobile/auth/qr/complete')
            .send({
                sessionId,
                oneTimeCode,
                walletAddress: '0xABCDEF',
                signatureDigest: crypto.randomBytes(32).toString('hex')
            });

        expect(completeResponse.status).toBe(200);
        expect(completeResponse.body.status).toBe('verified');

        const statusResponse = await request(app)
            .get(`/api/mobile/auth/qr/status/${sessionId}`)
            .set('x-api-key', 'test-gateway-key');

        expect(statusResponse.status).toBe(200);
        expect(statusResponse.body.status).toBe('verified');

        const secondRead = await request(app)
            .get(`/api/mobile/auth/qr/status/${sessionId}`)
            .set('x-api-key', 'test-gateway-key');

        expect(secondRead.status).toBe(404);
    });

    test('secure election session returns paper fallback when payload is malformed', async () => {
        const initResponse = await request(app)
            .post('/api/mobile/election/session/init')
            .set('x-api-key', 'test-gateway-key')
            .send({ voterIdHash: 'voter-hash', constituency: 'Ontario-East' });

        expect(initResponse.status).toBe(200);
        expect(initResponse.body.paperFallbackCode).toBeDefined();

        const verifyResponse = await request(app)
            .post('/api/mobile/election/session/verify')
            .set('x-api-key', 'test-gateway-key')
            .send({
                sessionId: initResponse.body.sessionId,
                ballotHash: 'not-a-hash',
                zkProofDigest: 'also-invalid'
            });

        expect(verifyResponse.status).toBe(400);
        expect(verifyResponse.body.status).toBe('fallback-required');
        expect(verifyResponse.body.paperFallbackCode).toBe(initResponse.body.paperFallbackCode);
    });
});
