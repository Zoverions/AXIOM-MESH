import axios from 'axios';
import { spawn } from 'child_process';
import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type CapturedIntent = {
    id: string;
    session_id: string;
    channel: string;
    content: string;
    metadata?: Record<string, unknown>;
    timestamp: number;
};

const startStubHypervisor = async (): Promise<{ server: http.Server; captured: CapturedIntent[] }> => {
    const captured: CapturedIntent[] = [];

    return new Promise((resolve) => {
        const app = express();
        app.use(express.json());

        app.get('/health', (_req, res) => {
            res.json({ status: 'ok', component: 'hypervisor', dependencies: { sandbox: 'ok' } });
        });

        app.get('/agents', (_req, res) => {
            res.json({ agents: [{ id: 'agent-1', status: 'ready' }] });
        });

        app.post('/process', (req, res) => {
            captured.push(req.body);
            res.json({
                status: 'success',
                intent_id: req.body.id,
                response: `stub-response:${req.body.content}`,
                confidence: 0.9,
                provenance: ['stub-hypervisor']
            });
        });

        const server = app.listen(8005, () => resolve({ server, captured }));
    });
};

const startStubGrid = async (): Promise<http.Server> => {
    return new Promise((resolve) => {
        const app = express();
        app.use(express.json());

        app.get('/health', (_req, res) => {
            res.json({ status: 'ok', component: 'grid', dependencies: { p2p: 'ok' } });
        });

        app.get('/network/nodes', (_req, res) => {
            res.json({ nodes: [{ id: 'node-1', reliability: 'high' }] });
        });

        app.get('/swarm', (_req, res) => {
            res.json({ swarms: [{ id: 'swarm-1', peers: 3 }] });
        });

        const server = app.listen(5000, () => resolve(server));
    });
};

describe('Gateway integration contracts', () => {
    let hypervisorServer: http.Server;
    let gridServer: http.Server;
    let capturedIntents: CapturedIntent[] = [];
    let gatewayProcess: any;

    beforeAll(async () => {
        const hypervisor = await startStubHypervisor();
        hypervisorServer = hypervisor.server;
        capturedIntents = hypervisor.captured;
        gridServer = await startStubGrid();

        const gwEnv = {
            ...process.env,
            NODE_ENV: 'test',
            CORS_ORIGINS: 'http://127.0.0.1:3005',
            ALLOW_MISSING_ORIGIN: 'true',
            GATEWAY_REST_PORT: '3005',
            GATEWAY_WS_PORT: '3006',
            GATEWAY_API_KEY: 'gw_key',
            HYPERVISOR_URL: 'http://127.0.0.1:8005',
            HYPERVISOR_API_KEY: 'test_key',
            GRID_URL: 'http://127.0.0.1:5000/skills',
            CERTS_DIR: path.resolve(__dirname, '../../../../certs'),
            NO_PROXY: 'localhost,127.0.0.1',
            no_proxy: 'localhost,127.0.0.1',
            HTTP_PROXY: '',
            HTTPS_PROXY: '',
            ALL_PROXY: ''
        };

        gatewayProcess = spawn('node', ['-r', 'ts-node/register', 'index.ts'], {
            cwd: path.resolve(__dirname, '../../'),
            env: gwEnv,
            stdio: 'inherit'
        });

        let gwUp = false;
        for (let i = 0; i < 40; i++) {
            try {
                const res = await axios.get('https://127.0.0.1:3005/health', {
                    headers: { Origin: 'https://127.0.0.1:3005' },
                    httpsAgent: new https.Agent({
                        rejectUnauthorized: false,
                        cert: fs.readFileSync(path.resolve(__dirname, '../../../../certs/gateway.crt')),
                        key: fs.readFileSync(path.resolve(__dirname, '../../../../certs/gateway.key')),
                        ca: [fs.readFileSync(path.resolve(__dirname, '../../../../certs/ca.crt'))]
                    })
                });
                if (res.status === 200) {
                    gwUp = true;
                    break;
                }
            } catch (err: any) {
                await delay(500);
            }
        }

        axios.defaults.headers.common['Origin'] = 'https://127.0.0.1:3005';
        axios.defaults.httpsAgent = new https.Agent({
            rejectUnauthorized: false,
            cert: fs.readFileSync(path.resolve(__dirname, '../../../../certs/gateway.crt')),
            key: fs.readFileSync(path.resolve(__dirname, '../../../../certs/gateway.key')),
            ca: [fs.readFileSync(path.resolve(__dirname, '../../../../certs/ca.crt'))]
        });

        if (!gwUp) {
            throw new Error('Gateway server failed to start');
        }
    }, 40000);

    afterAll(() => {
        if (hypervisorServer) hypervisorServer.close();
        if (gridServer) gridServer.close();
        if (gatewayProcess) gatewayProcess.kill('SIGTERM');
    });

    it('enforces auth consistently for dashboard and REST', async () => {
        await expect(axios.get('https://127.0.0.1:3005/')).rejects.toMatchObject({
            response: { status: 401 }
        });

        const dashboardRes = await axios.get('https://127.0.0.1:3005/?apiKey=gw_key');
        expect(dashboardRes.status).toBe(200);

        await expect(axios.get('https://127.0.0.1:3005/api/v1/agents')).rejects.toMatchObject({
            response: { status: 401 }
        });

        const agentsRes = await axios.get('https://127.0.0.1:3005/api/v1/agents', {
            headers: { 'x-api-key': 'gw_key' }
        });
        expect(agentsRes.status).toBe(200);
        expect(agentsRes.data.agents).toHaveLength(1);
    });

    it('processes intent with strict contract shape through hypervisor stub', async () => {
        const missingContent = await axios.post('https://127.0.0.1:3005/api/v1/intent/process', { channel: 'test' }, {
            headers: { Authorization: 'Bearer gw_key' },
            validateStatus: () => true
        });
        expect(missingContent.status).toBe(400);
        expect(missingContent.data.error).toBe('Content is required');

        const payload = {
            session_id: 'sess-contract-1',
            channel: 'test',
            content: '/exec print("Hello")',
            metadata: { sender: 'integration_tester', response_style: 'analytical' }
        };

        const response = await axios.post('https://127.0.0.1:3005/api/v1/intent/process', payload, {
            headers: { Authorization: 'Bearer gw_key' }
        });

        expect(response.status).toBe(200);
        expect(response.data).toMatchObject({
            status: 'success',
            intent_id: expect.any(String),
            response: expect.stringContaining('stub-response:/exec print("Hello")')
        });

        const captured = capturedIntents[capturedIntents.length - 1];
        expect(captured).toMatchObject({
            session_id: 'sess-contract-1',
            channel: 'test',
            content: '/exec print("Hello")',
            metadata: { sender: 'integration_tester', response_style: 'analytical' }
        });
    });

    it('uses grid stubs for status and network APIs', async () => {
        const statusRes = await axios.get('https://127.0.0.1:3005/api/v1/status', {
            headers: { Authorization: 'Bearer gw_key' }
        });
        expect(statusRes.status).toBe(200);
        expect(statusRes.data.grid).toMatchObject({ status: 'ok', component: 'grid' });

        const networkRes = await axios.get('https://127.0.0.1:3005/api/v1/network', {
            headers: { Authorization: 'Bearer gw_key' }
        });
        expect(networkRes.status).toBe(200);
        expect(networkRes.data.nodes[0].id).toBe('node-1');
    });

    it('enforces websocket auth and supports valid authenticated flow', async () => {
        await new Promise<void>((resolve) => {
            const unauthorizedWs = new WebSocket('ws://127.0.0.1:3006');
            unauthorizedWs.on('close', (code) => {
                expect(code).toBe(1008);
                resolve();
            });
        });

        await new Promise<void>((resolve, reject) => {
            const ws = new WebSocket('ws://127.0.0.1:3006?apiKey=gw_key');

            ws.on('open', () => {
                ws.send(JSON.stringify({ session_id: 'ws-contract-session', input: 'hello over ws' }));
            });

            ws.on('message', (message) => {
                const parsed = JSON.parse(message.toString());
                if (parsed.status === 'pending') {
                    return;
                }

                try {
                    expect(parsed).toMatchObject({
                        status: 'success',
                        response: expect.stringContaining('stub-response:hello over ws')
                    });
                    ws.close();
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });

            ws.on('error', reject);
        });
    });
});
