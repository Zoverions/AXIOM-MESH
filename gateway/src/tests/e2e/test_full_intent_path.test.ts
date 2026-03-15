import axios from 'axios';
import { spawn } from 'child_process';
import express from 'express';
import http from 'http';
import path from 'path';

// We will start a stub sandbox
const startStubSandbox = async (): Promise<http.Server> => {
    return new Promise((resolve) => {
        const app = express();
        app.use(express.json());
        app.post('/execute', (req, res) => {
            res.json({ status: 'success', output: 'Integration Sandbox Stub Response\n' });
        });
        app.get('/health', (req, res) => {
            res.json({ status: 'ok' });
        });
        const server = app.listen(4005, () => resolve(server));
    });
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Full Intent Path Integration', () => {
    let sandboxServer: http.Server;
    let hypervisorProcess: any;
    let gatewayProcess: any;

    beforeAll(async () => {
        sandboxServer = await startStubSandbox();

        // Start Hypervisor using the absolute paths to python, uvicorn and npx.
        // We ensure PYTHONPATH is the hypervisor directory.
        const hvEnv = { ...process.env, HYPERVISOR_API_KEY: 'test_key', SANDBOX_URL: 'http://localhost:4005/execute', PYTHONPATH: path.resolve(__dirname, '../../../../hypervisor') };

        const venvPython = path.resolve(__dirname, '../../../../hypervisor/venv/bin/python');

        hypervisorProcess = spawn(venvPython, ['-m', 'uvicorn', 'src.api.server:app', '--port', '8005'], {
            cwd: path.resolve(__dirname, '../../../../hypervisor'),
            env: hvEnv,
            stdio: 'ignore' // set to 'inherit' to debug but ignore cleans up logs
        });

        hypervisorProcess.on('error', (err: Error) => {
            console.error('Hypervisor spawn error', err);
        });

        // Start Gateway
        const gwEnv = { ...process.env, GATEWAY_REST_PORT: '3005', GATEWAY_API_KEY: 'gw_key', HYPERVISOR_URL: 'http://localhost:8005', HYPERVISOR_API_KEY: 'test_key' };

        gatewayProcess = spawn('node', ['-r', 'ts-node/register', 'src/index.ts'], {
            cwd: path.resolve(__dirname, '../../../'),
            env: gwEnv,
            stdio: 'ignore'
        });

        gatewayProcess.on('error', (err: Error) => {
            console.error('Gateway spawn error', err);
        });

        // Wait for servers to be up
        let hvUp = false;
        for (let i = 0; i < 20; i++) {
            try {
                const res = await axios.get('http://localhost:8005/health');
                if (res.status === 200) {
                    hvUp = true;
                    break;
                }
            } catch (e) {
                await delay(1000);
            }
        }

        let gwUp = false;
        for (let i = 0; i < 20; i++) {
            try {
                const res = await axios.get('http://localhost:3005/health');
                if (res.status === 200) {
                    gwUp = true;
                    break;
                }
            } catch (e) {
                await delay(1000);
            }
        }

        if (!hvUp || !gwUp) {
            throw new Error(`Servers failed to start: hvUp=${hvUp}, gwUp=${gwUp}`);
        }
    }, 30000);

    afterAll(() => {
        if (sandboxServer) sandboxServer.close();
        if (hypervisorProcess) {
            hypervisorProcess.kill('SIGTERM');
        }
        if (gatewayProcess) {
            gatewayProcess.kill('SIGTERM');
        }
    });

    it('should process an intent from Gateway -> Hypervisor -> Sandbox stub', async () => {
        const intentPayload = {
            channel: 'test',
            content: '/exec print("Hello World")',
            metadata: { sender: 'integration_tester' }
        };

        const response = await axios.post('http://localhost:3005/api/v1/intent/process', intentPayload, {
            headers: { Authorization: 'Bearer gw_key' }
        });

        expect(response.status).toBe(200);
        expect(response.data.status).toBe('success');
        expect(response.data.response).toContain('Integration Sandbox Stub Response');
    }, 15000);
});
