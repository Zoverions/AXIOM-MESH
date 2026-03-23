// Jest configuration issues with uuid/ESM - mock uuid before import
jest.mock('uuid', () => ({ v4: () => '123e4567-e89b-12d3-a456-426614174000' }));
import request from 'supertest';
import { Server } from 'http';
import WebSocket from 'ws';
import express from 'express';
import { WebSocketServer } from 'ws';
import restRouter from '../../routes/rest';
import { extractApiKeyFromHeaders, validateGatewayApiKey } from '../../middleware/auth_utils';
import { parseAndSanitizeIntent } from '../../middleware/intent_parser';
import { normalizeInput } from '../../utils/normalizer';
import { sendToHypervisor } from '../../services/hypervisorClient';
import { filterACS } from '../../middleware/referent_filter';
import { BackpressureWebSocket } from '../../performance/EventLoopOptimizer';

jest.mock('../../services/hypervisorClient', () => ({
    sendToHypervisor: jest.fn().mockResolvedValue({ response: 'mocked response', id: '123', intent_id: '123' })
}));

describe('WebSocket E2E Tests', () => {
    let server: Server;
    let wss: WebSocketServer;
    let wsClient: WebSocket;
    let port: number;

    beforeAll((done) => {
        const app = express();
        app.use(express.json());
        app.use('/', restRouter);

        server = app.listen(0, () => {
            port = (server.address() as any).port;
            wss = new WebSocketServer({ server });

            process.env.GATEWAY_API_KEY = 'test-key';

            wss.on('connection', (ws: WebSocket, req: any) => {
                const url = new URL(req.url, `http://${req.headers.host}`);
                const token = extractApiKeyFromHeaders(req.headers, url.searchParams.get('apiKey'));
                const validation = validateGatewayApiKey(token, process.env.GATEWAY_API_KEY);

                if (!validation.ok) {
                    const reason = validation.code === 500 ? 'Server configuration error' : 'Unauthorized: Invalid API Key';
                    ws.close(validation.code === 500 ? 1011 : 1008, reason);
                    return;
                }

                const backpressureWs = new BackpressureWebSocket(ws as any);

                ws.on('message', async (message: Buffer) => {
                    try {
                        const data = await parseAndSanitizeIntent(message.toString());
                        const session_id = data.session_id || 'default_ws_session';
                        const metadata = {
                            identity_hash: data.identity_hash,
                            response_style: data.modality || 'standard',
                            conversation_id: data.conversation_id || session_id,
                            actor_id: data.actor_id || data.identity_hash || 'websocket_user',
                            consent_scope: data.consent_scope || 'allowed'
                        };
                        const intent = normalizeInput(session_id, 'websocket', data.input, metadata);

                        backpressureWs.send(JSON.stringify({ status: 'pending', intent_id: intent.id, trace_id: intent.trace_id }));

                        const response = await sendToHypervisor(intent);
                        if (response.response) {
                            response.response = filterACS(response.response);
                        }

                        backpressureWs.send(JSON.stringify(response));
                    } catch (error) {
                        backpressureWs.send(JSON.stringify({ error: 'Invalid message format' }));
                    }
                });
            });
            done();
        });
    });

    afterAll((done) => {
        wss.close(() => {
            server.close(done);
        });
    });

    test('should connect and authenticate with valid token', (done) => {
        wsClient = new WebSocket(`ws://localhost:${port}?apiKey=test-key`);

        wsClient.on('open', () => {
            wsClient.close();
            done();
        });
    });

    test('should reject invalid token', (done) => {
        wsClient = new WebSocket(`ws://localhost:${port}?apiKey=invalid-key`);

        wsClient.on('error', () => {}); // Handle expected error

        wsClient.on('close', (code, reason) => {
            expect(code).toBe(1008);
            expect(reason.toString()).toBe('Unauthorized: Invalid API Key');
            done();
        });
    });

    test('should handle intent messages', (done) => {
        wsClient = new WebSocket(`ws://localhost:${port}?apiKey=test-key`);

        wsClient.on('open', () => {
            wsClient.send(JSON.stringify({ input: 'hello' }));
        });

        let messageCount = 0;
        wsClient.on('message', (data) => {
            const response = JSON.parse(data.toString());
            if (response.status === 'pending') {
                messageCount++;
            } else if (response.response === 'mocked response') {
                messageCount++;
                expect(messageCount).toBe(2);
                wsClient.close();
                done();
            }
        });
    });

    test('should reconnect and process message after prior disconnect', (done) => {
        const firstClient = new WebSocket(`ws://localhost:${port}?apiKey=test-key`);

        firstClient.on('open', () => {
            firstClient.close();
        });

        firstClient.on('close', () => {
            const secondClient = new WebSocket(`ws://localhost:${port}?apiKey=test-key`);

            secondClient.on('open', () => {
                secondClient.send(JSON.stringify({ input: 'hello again' }));
            });

            secondClient.on('message', (data) => {
                const response = JSON.parse(data.toString());
                if (response.response === 'mocked response') {
                    secondClient.close();
                    done();
                }
            });
        });
    });
});
