// Jest configuration issues with uuid/ESM - mock uuid before import
jest.mock('uuid', () => ({ v4: () => '123e4567-e89b-12d3-a456-426614174000' }));
import request from 'supertest';
import express from 'express';
import restRouter from '../../routes/rest';

// SUB-W.1 Gateway: Channel adapter tests missing (Discord, Slack, Telegram). Add mocked channel tests in next iteration.
// This implements SUB-W.1.
describe('Gateway Channel Adapters Mock Tests for Discord, Slack, and Telegram', () => {
    let mockApp: express.Express;

    beforeAll(() => {
        mockApp = express();
        mockApp.use(express.json());
        mockApp.use('/', restRouter);
    });

    const channelsToTest = [
        {
            name: 'discord',
            data: {
                channel: 'discord',
                content: 'testing discord channel normalization',
                metadata: { guildId: 'd-123', userId: 'u-456', channelId: 'c-789' }
            }
        },
        {
            name: 'slack',
            data: {
                channel: 'slack',
                content: 'testing slack channel normalization',
                metadata: { teamId: 't-123', userId: 'u-456', channelId: 'c-789' }
            }
        },
        {
            name: 'telegram',
            data: {
                channel: 'telegram',
                content: 'testing telegram channel normalization',
                metadata: { chatId: 'ch-123', userId: 'u-456', messageId: 'm-789' }
            }
        }
    ];

    for (const channelTest of channelsToTest) {
        it(`should successfully process and normalize the ${channelTest.name} adapter payload`, async () => {
            const response = await request(mockApp)
                .post('/api/v1/intent/process/dev-public')
                .send(channelTest.data);

            expect(response.status).toEqual(200);
            expect(response.body.intent_id).toBeTruthy();
        });
    }
});
