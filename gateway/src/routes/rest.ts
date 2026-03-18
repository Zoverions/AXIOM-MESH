import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { normalizeInput } from '../utils/normalizer';
import { sanitizeContent, sanitizeMetadata } from '../utils/sanitize';
import { sendToHypervisor } from '../services/hypervisorClient';
import { getLogsBuffer } from '../utils/logger';
import { authMiddleware } from '../middleware/auth';
import { publicIntentRateLimit } from '../middleware/public_rate_limit';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// Determine .env path based on whether we are in Docker or local dev
const ENV_PATH = fs.existsSync('/app/.env') ? '/app/.env' : path.resolve(__dirname, '../../../.env');

const router = Router();

const gatewayMetrics = { requests: 0, errors: 0 };


function getGridBaseUrl(): string {
    return process.env.GRID_URL ? process.env.GRID_URL.replace('/skills', '') : 'http://grid:5000';
}


router.post('/api/v1/intent/process/public', publicIntentRateLimit, async (req: Request, res: Response) => {
    gatewayMetrics.requests++;
    try {
        const { channel, content, metadata } = req.body;
        const sanitizedContent = sanitizeContent(content);
        if (!sanitizedContent) {
            res.status(400).json({ error: 'Content is required' });
            return;
        }

        // Only allow process from public if it's for comparison/testing
        // and doesn't contain sensitive data
        const session_id = req.body.session_id || 'public_test_session';
        const intent = normalizeInput(session_id, channel || 'tester', sanitizedContent, sanitizeMetadata(metadata));
        const response = await sendToHypervisor(intent);

        res.json(response);
    } catch (error) {
        gatewayMetrics.errors++;
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/api/v1/intent/process', authMiddleware, async (req: Request, res: Response) => {
    gatewayMetrics.requests++;
    try {
        const { session_id, channel, content, metadata } = req.body;
        const sanitizedContent = sanitizeContent(content);
        if (!sanitizedContent) {
            res.status(400).json({ error: 'Content is required' });
            return;
        }

        const sid = session_id || 'api_session';
        const intent = normalizeInput(sid, channel || 'api', sanitizedContent, sanitizeMetadata(metadata));
        const response = await sendToHypervisor(intent);

        res.json(response);
    } catch (error) {
        gatewayMetrics.errors++;
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', component: 'omni-gateway' });
});


// --- Agents API ---
router.get('/api/v1/agents', authMiddleware, async (req: Request, res: Response) => {
    try {
        const hypervisorRes = await axios.get(process.env.HYPERVISOR_URL + '/agents');
        res.json(hypervisorRes.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch agents data from Hypervisor', details: error.message });
    }
});

// --- Swarms API ---
router.get('/api/v1/swarms', authMiddleware, async (req: Request, res: Response) => {
    try {
        const gridUrl = getGridBaseUrl();
        const gridRes = await axios.get(gridUrl + '/swarm');
        res.json(gridRes.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch swarms from Grid', details: error.message });
    }
});

router.post('/api/v1/swarms', authMiddleware, async (req: Request, res: Response) => {
    try {
        const gridUrl = getGridBaseUrl();
        const gridRes = await axios.post(gridUrl + '/swarm', req.body);
        res.json(gridRes.data);
    } catch (error: any) {
        const msg = error.response && error.response.data ? error.response.data : error.message;
        res.status(500).json({ error: 'Failed to create swarm on Grid', details: msg });
    }
});

router.post('/api/v1/swarms/join', authMiddleware, async (req: Request, res: Response) => {
    try {
        const gridUrl = getGridBaseUrl();
        const gridRes = await axios.post(gridUrl + '/swarm/join', req.body);
        res.json(gridRes.data);
    } catch (error: any) {
        const msg = error.response && error.response.data ? error.response.data : error.message;
        res.status(500).json({ error: 'Failed to join swarm on Grid', details: msg });
    }
});

// --- Network API ---
router.get('/api/v1/network', authMiddleware, async (req: Request, res: Response) => {
    try {
        // Grid API URL
        const gridUrl = getGridBaseUrl();
        const gridRes = await axios.get(gridUrl + '/network/nodes');
        res.json(gridRes.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch network nodes from Grid', details: error.message });
    }
});

// --- Status API ---
router.get('/api/v1/status', authMiddleware, async (req: Request, res: Response) => {
    const statuses: Record<string, any> = {
        gateway: {
            status: 'ok',
            component: 'gateway',
            dependencies: {
                hypervisor: 'unknown',
                sandbox: 'unknown',
                grid: 'unknown'
            }
        },
        hypervisor: { status: 'offline' },
        sandbox: { status: 'offline' },
        grid: { status: 'offline' }
    };

    async function timedHealthcheck(name: string, url: string) {
        const started = Date.now();
        try {
            const response = await axios.get(url, { timeout: 4000 });
            return {
                ...response.data,
                latency_ms: Date.now() - started,
                degraded: false
            };
        } catch (error: any) {
            return {
                status: 'offline',
                degraded: true,
                latency_ms: Date.now() - started,
                error: error.message,
                component: name
            };
        }
    }

    try {
        statuses.hypervisor = await timedHealthcheck('hypervisor', process.env.HYPERVISOR_URL + '/health');
    } catch {}

    try {
        statuses.sandbox = await timedHealthcheck('sandbox', 'http://sandbox:4000/health');
    } catch {}

    try {
        statuses.grid = await timedHealthcheck('grid', getGridBaseUrl() + '/health');
    } catch {}

    statuses.gateway.dependencies = {
        hypervisor: statuses.hypervisor.status,
        sandbox: statuses.sandbox.status,
        grid: statuses.grid.status
    };
    statuses.gateway.metrics = gatewayMetrics;

    res.json(statuses);
});

// --- Memory API ---
router.get('/api/v1/memory', authMiddleware, async (req: Request, res: Response) => {
    try {
        const sessionId = req.query.session_id as string | undefined;
        const url = process.env.HYPERVISOR_URL + '/memory' + (sessionId ? `?session_id=${sessionId}` : '');
        const hypervisorRes = await axios.get(url);
        res.json(hypervisorRes.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch memory from Hypervisor', details: error.message });
    }
});

router.delete('/api/v1/memory/:nodeId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { nodeId } = req.params;
        const hypervisorRes = await axios.delete(process.env.HYPERVISOR_URL + `/memory/${nodeId}`);
        res.json(hypervisorRes.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to delete memory', details: error.message });
    }
});

router.put('/api/v1/memory/:nodeId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { nodeId } = req.params;
        const hypervisorRes = await axios.put(process.env.HYPERVISOR_URL + `/memory/${nodeId}`, req.body);
        res.json(hypervisorRes.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to edit memory', details: error.message });
    }
});

// --- Logs API ---
router.get('/api/v1/logs', authMiddleware, async (req: Request, res: Response) => {
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
const SENSITIVE_KEYWORDS = ['KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'SESSION', 'PRIV'];

// --- Metrics API ---
router.get('/api/v1/metrics/system', authMiddleware, (req: Request, res: Response) => {
    res.json(gatewayMetrics);
});

router.post('/api/v1/metrics/cooperation', authMiddleware, async (req: Request, res: Response) => {
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

router.get('/api/v1/config', authMiddleware, (req: Request, res: Response) => {
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
                    const isSensitive = SENSITIVE_KEYWORDS.some(kw => key.toUpperCase().includes(kw));
                    if (isSensitive && value.length > 0) {
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

router.post('/api/v1/config', authMiddleware, (req: Request, res: Response) => {
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
