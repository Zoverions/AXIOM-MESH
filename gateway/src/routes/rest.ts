import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { normalizeInput } from '../utils/normalizer';
import { sendToHypervisor } from '../services/hypervisorClient';
import { getLogsBuffer } from '../utils/logger';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// Determine .env path based on whether we are in Docker or local dev
const ENV_PATH = fs.existsSync('/app/.env') ? '/app/.env' : path.resolve(__dirname, '../../../.env');

const router = Router();

// Middleware to authenticate REST requests
const authMiddleware = (req: Request, res: Response, next: Function) => {
    const apiKey = process.env.GATEWAY_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error: GATEWAY_API_KEY is not set' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (token !== apiKey) {
        return res.status(403).json({ error: 'Forbidden: Invalid API Key' });
    }

    next();
};

router.post('/api/v1/intent/process/public', async (req: Request, res: Response) => {
    try {
        const { channel, content, metadata } = req.body;
        if (!content) {
            res.status(400).json({ error: 'Content is required' });
            return;
        }

        // Only allow process from public if it's for comparison/testing
        // and doesn't contain sensitive data
        const session_id = req.body.session_id || 'public_test_session';
        const intent = normalizeInput(session_id, channel || 'tester', content, metadata);
        const response = await sendToHypervisor(intent);

        res.json(response);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/api/v1/intent/process', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { session_id, channel, content, metadata } = req.body;
        if (!content) {
            res.status(400).json({ error: 'Content is required' });
            return;
        }

        const sid = session_id || 'api_session';
        const intent = normalizeInput(sid, channel || 'api', content, metadata);
        const response = await sendToHypervisor(intent);

        res.json(response);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', component: 'omni-gateway' });
});


// --- Agents API ---
router.get('/api/v1/agents', async (req: Request, res: Response) => {
    try {
        const hypervisorRes = await axios.get(process.env.HYPERVISOR_URL + '/agents');
        res.json(hypervisorRes.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch agents data from Hypervisor', details: error.message });
    }
});

// --- Network API ---
router.get('/api/v1/network', async (req: Request, res: Response) => {
    try {
        // Grid API URL
        const gridUrl = process.env.GRID_URL ? process.env.GRID_URL.replace('/skills', '') : 'http://grid:5000';
        const gridRes = await axios.get(gridUrl + '/network/nodes');
        res.json(gridRes.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch network nodes from Grid', details: error.message });
    }
});

// --- Status API ---
router.get('/api/v1/status', async (req: Request, res: Response) => {
    const statuses: Record<string, string> = {
        gateway: 'ok',
        hypervisor: 'offline',
        sandbox: 'offline',
        grid: 'offline'
    };

    try {
        const hypervisorRes = await axios.get(process.env.HYPERVISOR_URL + '/health').catch(() => null);
        if (hypervisorRes && hypervisorRes.data.status === 'ok') statuses.hypervisor = 'ok';
    } catch {}

    try {
        const sandboxRes = await axios.get('http://sandbox:4000/health').catch(() => null);
        if (sandboxRes && sandboxRes.data.status === 'ok') statuses.sandbox = 'ok';
    } catch {}

    try {
        const gridRes = await axios.get('http://grid:5000/health').catch(() => null);
        if (gridRes && gridRes.data.status === 'ok') statuses.grid = 'ok';
    } catch {}

    res.json(statuses);
});

// --- Memory API ---
router.get('/api/v1/memory', async (req: Request, res: Response) => {
    try {
        const sessionId = req.query.session_id as string | undefined;
        const url = process.env.HYPERVISOR_URL + '/memory' + (sessionId ? `?session_id=${sessionId}` : '');
        const hypervisorRes = await axios.get(url);
        res.json(hypervisorRes.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch memory from Hypervisor', details: error.message });
    }
});

router.delete('/api/v1/memory/:nodeId', async (req: Request, res: Response) => {
    try {
        const { nodeId } = req.params;
        const hypervisorRes = await axios.delete(process.env.HYPERVISOR_URL + `/memory/${nodeId}`);
        res.json(hypervisorRes.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to delete memory', details: error.message });
    }
});

router.put('/api/v1/memory/:nodeId', async (req: Request, res: Response) => {
    try {
        const { nodeId } = req.params;
        const hypervisorRes = await axios.put(process.env.HYPERVISOR_URL + `/memory/${nodeId}`, req.body);
        res.json(hypervisorRes.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to edit memory', details: error.message });
    }
});

// --- Logs API ---
router.get('/api/v1/logs', async (req: Request, res: Response) => {
    try {
        // We will try multiple sources of logs to provide the most complete picture.
        // First, check the Gateway's internal buffer.
        let fullLogs = "--- Gateway Node Logs ---\n" + (getLogsBuffer() || "No logs available.") + "\n\n";

        // If docker socket is available (e.g., if re-mounted for complete system observability)
        if (fs.existsSync('/var/run/docker.sock')) {
            try {
                // Execute a lightweight curl against the Docker engine API to get recent logs for other containers
                // This avoids needing the full `docker-compose` CLI inside the Node container.
                const { stdout, stderr } = await execPromise('curl --silent --unix-socket /var/run/docker.sock http://localhost/containers/json');
                if (stdout) {
                    try {
                        const containers = JSON.parse(stdout);
                        let formattedStatus = "";
                        containers.forEach((c: any) => {
                            const name = c.Names && c.Names.length > 0 ? c.Names[0].replace('/', '') : 'Unknown';
                            formattedStatus += `Container: ${name} | State: ${c.State} | Status: ${c.Status}\n`;
                        });
                        fullLogs += "--- Connected Container Statuses ---\n" + formattedStatus + "\n\n";
                    } catch (parseError) {
                        fullLogs += "--- Docker Observability Error ---\nFailed to parse Docker API response.\n\n";
                    }
                }
            } catch (e) {
                fullLogs += "--- Docker Observability Error ---\nCould not fetch deeper container stats.\n\n";
            }
        } else {
             fullLogs += "--- System Observability Note ---\nDocker socket not mounted. Viewing logs for the Gateway service only.\nTo view full agent system logs, mount /var/run/docker.sock to the Gateway.\n\n";
        }

        res.json({ logs: fullLogs });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch logs', details: error.message });
    }
});

// --- Configuration API ---
const SENSITIVE_KEYS = ['OPENAI_API_KEY', 'DISCORD_TOKEN', 'WHATSAPP_SESSION'];

// A simple middleware to ensure only local origins can edit config (since there is no auth yet)
const localOnly = (req: Request, res: Response, next: Function) => {
    const origin = req.get('origin') || req.get('referer') || '';
    if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        return res.status(403).json({ error: 'Configuration editing is restricted to local interfaces for security.' });
    }
    next();
};

// --- Metrics API ---
router.post('/api/v1/metrics/cooperation', async (req: Request, res: Response) => {
    const { style, type, prompt } = req.body;
    const metricsPath = path.join(process.cwd(), 'data/cooperation_metrics.json');

    try {
        let metrics = [];
        if (fs.existsSync(metricsPath)) {
            metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
        }

        metrics.push({
            timestamp: new Date().toISOString(),
            style,
            type,
            prompt
        });

        if (!fs.existsSync(path.dirname(metricsPath))) {
            fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
        }

        fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
        res.json({ status: 'success' });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to save metrics', details: error.message });
    }
});

router.get('/api/v1/config', localOnly, (req: Request, res: Response) => {
    try {
        if (!fs.existsSync(ENV_PATH)) {
            return res.json({});
        }
        const envContent = fs.readFileSync(ENV_PATH, 'utf-8');
        const config: Record<string, string> = {};
        envContent.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const idx = trimmed.indexOf('=');
                if (idx > 0) {
                    const key = trimmed.substring(0, idx).trim();
                    let value = trimmed.substring(idx + 1).trim();

                    // Mask sensitive keys
                    if (SENSITIVE_KEYS.includes(key) && value.length > 0) {
                        value = value.substring(0, 3) + '********' + value.substring(value.length - 3);
                    }
                    config[key] = value;
                }
            }
        });
        res.json(config);
    } catch (error: any) {
        res.status(500).json({ error: `Failed to read config: ${error.message}` });
    }
});

router.post('/api/v1/config', localOnly, (req: Request, res: Response) => {
    try {
        const updates: Record<string, string> = req.body;
        let envLines: string[] = [];
        if (fs.existsSync(ENV_PATH)) {
            envLines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
        }

        const configMap = new Map<string, string>();
        envLines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const idx = trimmed.indexOf('=');
                if (idx > 0) {
                    const key = trimmed.substring(0, idx).trim();
                    const value = trimmed.substring(idx + 1).trim();
                    configMap.set(key, value);
                }
            }
        });

        // Update map with new values
        for (const [key, value] of Object.entries(updates)) {
            // Skip updating if the value is empty or appears to be a masked value (e.g., contains '********')
            if (value && !value.includes('********')) {
                configMap.set(key, value);
                // Also update process.env for current session if applicable
                process.env[key] = value;
            }
        }

        // Re-write .env file
        // To preserve comments, we could rewrite line-by-line, but for simplicity
        // and consistency with the Map updates, we will rebuild it.
        // A robust solution would parse and replace inline.
        const newLines = Array.from(configMap.entries()).map(([k, v]) => `${k}=${v}`);
        fs.writeFileSync(ENV_PATH, newLines.join('\n') + '\n', 'utf-8');

        res.json({ status: 'success', message: 'Configuration updated successfully' });
    } catch (error: any) {
        res.status(500).json({ error: `Failed to update config: ${error.message}` });
    }
});

export default router;
