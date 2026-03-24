// Jest configuration issues with uuid/ESM - mock uuid before import
jest.mock('uuid', () => ({ v4: () => '123e4567-e89b-12d3-a456-426614174000' }));
import request from 'supertest';
import express from 'express';
import restRouter from '../../routes/rest';

// TODO: SUB-W.1 Gateway: Channel adapter tests missing (Discord, Slack, Telegram).
describe('Mocked Channel Adapters Tests (Discord, Slack, Telegram)', () => {
    let app: express.Express;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/', restRouter);
    });

    test('Discord channel adapter normalization process', async () => {
        const payload = {
            channel: 'discord',
            content: 'discord message normalization test',
            metadata: {
                guildId: '11111',
                userId: '22222',
                channelId: '33333'
            }
        };

        const response = await request(app)
            .post('/api/v1/intent/process/dev-public')
            .send(payload);

        expect(response.status).toBe(200);
        expect(response.body.intent_id).toBeDefined();
    });

    test('Slack channel adapter normalization process', async () => {
        const payload = {
            channel: 'slack',
            content: 'slack message normalization test',
            metadata: {
                teamId: '44444',
                userId: '55555',
                channelId: '66666'
            }
        };

        const response = await request(app)
            .post('/api/v1/intent/process/dev-public')
            .send(payload);

        expect(response.status).toBe(200);
        expect(response.body.intent_id).toBeDefined();
    });

    test('Telegram channel adapter normalization process', async () => {
        const payload = {
            channel: 'telegram',
            content: 'telegram message normalization test',
            metadata: {
                chatId: '77777',
                userId: '88888',
                messageId: '99999'
            }
        };

        const response = await request(app)
            .post('/api/v1/intent/process/dev-public')
            .send(payload);

        expect(response.status).toBe(200);
        expect(response.body.intent_id).toBeDefined();
    });
});
