// Jest configuration issues with uuid/ESM - mock uuid before import
jest.mock('uuid', () => ({ v4: () => '123e4567-e89b-12d3-a456-426614174000' }));
import request from 'supertest';
import express from 'express';
import restRouter from '../../routes/rest';

describe('Channel Adapters Mock Tests', () => {
    let app: express.Express;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/', restRouter);
    });

    test('Discord channel adapter normalization', async () => {
        const payload = {
            channel: 'discord',
            content: 'test message from discord',
            metadata: {
                guildId: '12345',
                userId: '67890'
            }
        };

        const response = await request(app)
            .post('/api/v1/intent/process/dev-public')
            .send(payload);

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
    });

    test('Slack channel adapter normalization', async () => {
        const payload = {
            channel: 'slack',
            content: 'test message from slack',
            metadata: {
                teamId: '12345',
                userId: '67890'
            }
        };

        const response = await request(app)
            .post('/api/v1/intent/process/dev-public')
            .send(payload);

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
    });

    test('Telegram channel adapter normalization', async () => {
        const payload = {
            channel: 'telegram',
            content: 'test message from telegram',
            metadata: {
                chatId: '12345',
                userId: '67890'
            }
        };

        const response = await request(app)
            .post('/api/v1/intent/process/dev-public')
            .send(payload);

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
    });
});
