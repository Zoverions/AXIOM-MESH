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
import { ethers } from 'ethers';

const execPromise = util.promisify(exec);

import { MCPFirewall, MCPSecurityPolicy } from '../security/MCPFirewall';

const mcpPolicy: MCPSecurityPolicy = {
  toolValidation: {
    schemaStrictness: 'strict',
    maxToolDescriptionLength: 1000,
    prohibitedPatterns: [/<script>/i, /eval\(/i],
    requiredAnnotations: []
  },
  identityChain: {
    userTokenExchange: true,
    workloadIdentity: 'mTLS',
    sessionBinding: true
  },
  inputSanitization: {
    maxPromptLength: 8192,
    delimiterEnforcement: true,
    instructionBoundaryMarkers: [],
    semanticAnalysis: false
  }
};
const mcpFirewall = new MCPFirewall(mcpPolicy, ['sandbox_execute', 'register_grid_skill']);

// Registry storage for MCP Servers (in-memory, typically backed by Grid/DB)
const registeredMCPServers = new Map<string, any>();

// Determine .env path based on whether we are in Docker or local dev
const ENV_PATH = fs.existsSync('/app/.env') ? '/app/.env' : path.resolve(__dirname, '../../../.env');

const router = Router();

router.post('/api/v1/mcp/register', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { did, signature, payload } = req.body;
        if (!did || !signature || !payload) {
             res.status(400).json({ status: 'error', message: 'Missing required fields: did, signature, payload' });
             return;
        }

        const isValid = mcpFirewall.validateMCPServerRegistration(did, signature, payload);
        if (!isValid) {
             res.status(403).json({ status: 'error', message: 'MCP server registration failed code-signing verification' });
             return;
        }

        // Store the validated MCP server registration
        registeredMCPServers.set(did, {
            payload,
            signature,
            registeredAt: Date.now(),
            status: 'active'
        });

        res.status(200).json({ status: 'success', message: 'MCP server successfully registered', server: registeredMCPServers.get(did) });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

router.get('/api/v1/mcp/servers', authMiddleware, async (req: Request, res: Response) => {
    try {
        const servers = Array.from(registeredMCPServers.entries()).map(([did, data]) => ({
            did,
            ...data
        }));
        res.status(200).json({ status: 'success', servers });
    } catch (error: any) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

const gatewayMetrics = { requests: 0, errors: 0 };


function getGridBaseUrl(): string {
    return process.env.GRID_URL ? process.env.GRID_URL.replace('/skills', '') : 'http://grid:5000';
}

// In production, require authentication for public intents. Otherwise, just rate limit.
const publicIntentMiddlewares = process.env.NODE_ENV === 'production'
    ? [authMiddleware, publicIntentRateLimit]
    : [publicIntentRateLimit];

router.post('/api/v1/intent/process/dev-public', ...publicIntentMiddlewares, async (req: Request, res: Response) => {
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

router.post('/api/v1/nft/mint', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { type, targetDataSet, clarityLevel, recipientAddress, jurisdiction, expiry, rightsTier, issuerGuildID } = req.body;
        const { spawn } = require('child_process');

        // 1. Generate zkML proof + apply obfuscation rules via NemoClaw (mocked for Gateway level as it delegates to Privacy Router / Grid usually)
        // Actually pin the data to IPFS to get a CID
        const dataToUpload = targetDataSet || "default_data";
        let ipfsCidStr = "";

        try {
            ipfsCidStr = await new Promise((resolve, reject) => {
                const child = spawn('ipfs', ['add', '-q']);
                let out = '';
                child.stdout.on('data', (data: Buffer) => { out += data.toString(); });
                child.on('error', reject);
                child.on('close', (code: number) => {
                    if (code === 0) resolve(out.trim());
                    else reject(new Error(`IPFS CLI exited with code ${code}`));
                });
                child.stdin.write(dataToUpload);
                child.stdin.end();
            });
        } catch (err) {
            console.error("IPFS upload failed, falling back to keccak256 hash:", err);
            ipfsCidStr = dataToUpload; // fallback to hashing the data itself
        }

        // Ensure dataCID fits into bytes32 for the contract
        const dataCID = ethers.keccak256(ethers.toUtf8Bytes(ipfsCidStr));

        // 2. Mint the NFT on-chain
        const provider = new ethers.JsonRpcProvider(process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545");
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);

        if (type === "citizenship") {
            const contractAddress = process.env.CITIZENSHIP_NFT_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
            const abi = [
                "function mintCitizenship(address holder, string calldata jurisdiction, uint256 expiry, string calldata rightsTier, bytes32 zkProofHash, string calldata issuerGuildID, string calldata metadataURI) external"
            ];
            const contract = new ethers.Contract(contractAddress, abi, wallet);
            const metadataURI = `ipfs://${ipfsCidStr}`;
            const tx = await contract.mintCitizenship(recipientAddress, jurisdiction || "Global", expiry || Date.now() + 31536000000, rightsTier || "Citizen", dataCID, issuerGuildID || "Guild-001", metadataURI);
            const receipt = await tx.wait();

            res.json({
                status: 'success',
                message: 'Citizenship NFT minted',
                txHash: receipt.hash,
                type: 'citizenship'
            });
        } else {
            // Use the deployed DualLedgerIdentity contract
            // In a real scenario we'd dynamically load the ABI and address
            const contractAddress = process.env.DUAL_LEDGER_ADDRESS || "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
            const abi = [
                "function mintAuthorizationNFT(address holder, bytes32 dataCID, string calldata clarityLevel) external"
            ];

            const contract = new ethers.Contract(contractAddress, abi, wallet);

            // Send transaction
            const tx = await contract.mintAuthorizationNFT(recipientAddress, dataCID, clarityLevel);
            const receipt = await tx.wait();

            res.json({
                status: 'success',
                message: 'Authorization NFT minted',
                txHash: receipt.hash,
                dataCID: dataCID,
                clarityLevel
            });
        }
    } catch (error: any) {
        console.error("Error minting NFT:", error);
        res.status(500).json({ error: 'Failed to mint NFT', details: error.message });
    }
});

router.post('/api/v1/identity/verify', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { zkProofHash, a, b, c } = req.body;
        if (!zkProofHash || !a || !b || !c) {
            return res.status(400).json({ error: 'Missing zkProof params' });
        }

        const provider = new ethers.JsonRpcProvider(process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545");
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);

        const contractAddress = process.env.DUAL_LEDGER_ADDRESS || "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
        const abi = [
            "function verifyID(bytes32 zkProofHash, uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c) external returns (bool)"
        ];

        const contract = new ethers.Contract(contractAddress, abi, wallet);

        // This is a static call in our mock
        const isValid = await contract.verifyID.staticCall(zkProofHash, a, b, c);

        res.json({
            status: 'success',
            isValid: isValid
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to verify identity proof', details: error.message });
    }
});

router.post('/api/v1/guild/issue', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { guildId, recipientAddress, nftData } = req.body;
        if (!guildId || !recipientAddress || !nftData) {
            return res.status(400).json({ error: 'Missing issue payload' });
        }

        // Just simulating the delegation via POST to /api/v1/nft/mint
        res.json({
            status: 'success',
            message: 'DAO Mint process initialized',
            guildId
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to issue via Guild', details: error.message });
    }
});

router.post('/api/v1/data/feed', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { source_device, data, consent_scope } = req.body;

        if (!source_device || !data) {
            return res.status(400).json({ error: 'source_device and data are required' });
        }

        const dataStr = typeof data === 'string' ? data : JSON.stringify(data);

        const intent = normalizeInput("data_feed_session", "api", `/record_data ${dataStr}`, {
            source_device: source_device,
            consent_scope: consent_scope || "allowed",
            type: "data_feed"
        });

        const hypervisorRes = await sendToHypervisor(intent);

        res.json({
            status: 'success',
            message: 'Data feed recorded',
            intent_id: intent.id,
            response: hypervisorRes.response
        });
    } catch (error: any) {
        console.error("Error ingesting data feed:", error);
        res.status(500).json({ error: 'Failed to ingest data feed', details: error.message });
    }
});

router.get('/api/v1/data/query', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { tokenId } = req.query;
        if (!tokenId) {
            return res.status(400).json({ error: 'tokenId is required' });
        }

        // Send the query intent through the Privacy Router
        const intent = normalizeInput("data_query_session", "api", `/query_data ${tokenId}`, { tokenId: tokenId.toString() });
        const hypervisorRes = await sendToHypervisor(intent);

        let parsedData;
        try {
            parsedData = JSON.parse(hypervisorRes.response);
        } catch (e) {
            parsedData = hypervisorRes.response;
        }

        res.json({
            status: 'success',
            message: `Data queried with token ${tokenId}`,
            data: parsedData
        });
    } catch (error: any) {
        console.error("Error querying data:", error);
        res.status(500).json({ error: 'Failed to query data', details: error.message });
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

import distributionRouter from './distribution';
router.use('/api/v1/distribution', distributionRouter);

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

// --- Recovery & 2FA API ---
import { setupTOTP, setupPasskey, recoverMesh } from '../auth/2fa';

router.post('/api/v1/auth/2fa/setup', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { nodeId } = req.body;
        if (!nodeId) return res.status(400).json({ error: 'nodeId required' });
        const totpData = await setupTOTP(nodeId);
        res.json({ status: 'success', data: totpData });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to setup 2FA', details: error.message });
    }
});

router.post('/api/v1/auth/2fa/recover', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { nodeId, totpCode } = req.body;
        if (!nodeId || !totpCode) return res.status(400).json({ error: 'nodeId and totpCode required' });
        await recoverMesh(nodeId, totpCode, null);
        res.json({ status: 'success', message: 'Recovery initiated successfully' });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to recover mesh', details: error.message });
    }
});

export default router;
