import express, { Router } from 'express';
import request from 'supertest';
import router from './dashboard';

const app = express();
app.use(express.json());
app.use('/dashboard', router);

describe('Dashboard Internal Auth', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.GATEWAY_INTERNAL_SECRET;

    beforeEach(() => {
        jest.resetModules();
        process.env.NODE_ENV = 'test';
        delete process.env.GATEWAY_INTERNAL_SECRET;
    });

    afterAll(() => {
        process.env.NODE_ENV = originalEnv;
        process.env.GATEWAY_INTERNAL_SECRET = originalSecret;
    });

    test('POST /dashboard/alerts/ingest returns 403 when secret is missing', async () => {
        const response = await request(app)
            .post('/dashboard/alerts/ingest')
            .send({ alert_id: 'test-1' });

        expect(response.status).toBe(403);
        expect(response.body.error).toContain('Forbidden');
    });

    test('POST /dashboard/alerts/ingest returns 403 with old hardcoded secret', async () => {
        const response = await request(app)
            .post('/dashboard/alerts/ingest')
            .set('Authorization', 'Bearer internal-dev-secret-1234')
            .send({ alert_id: 'test-1' });

        expect(response.status).toBe(403);
    });

    test('POST /dashboard/alerts/ingest returns 200 with correct secret', async () => {
        process.env.GATEWAY_INTERNAL_SECRET = 'super-secret';
        const response = await request(app)
            .post('/dashboard/alerts/ingest')
            .set('Authorization', 'Bearer super-secret')
            .send({ alert_id: 'test-1' });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ingested');
    });

    test('POST /dashboard/alerts/ingest returns 500 in production if secret is missing', async () => {
        const prodApp = express();
        prodApp.use(express.json());
        // We need to re-require/re-import to pick up the env change if it's used at module level,
        // but here it's used inside the middleware function.
        process.env.NODE_ENV = 'production';
        delete process.env.GATEWAY_INTERNAL_SECRET;

        prodApp.use('/dashboard', router);

        const response = await request(prodApp)
            .post('/dashboard/alerts/ingest')
            .send({ alert_id: 'test-1' });

        expect(response.status).toBe(500);
        expect(response.body.error).toContain('GATEWAY_INTERNAL_SECRET missing');
    });
});
