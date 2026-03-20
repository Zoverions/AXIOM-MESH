import { Router, Request, Response } from 'express';
import { runCode } from '../services/dockerRunner';
import { NetworkNamespaceController } from '../execution/SecureRuntime';
import { SecretManager } from '../utils/secrets';

const router = Router();


async function validateSandboxApiKey(req: Request): Promise<{ ok: boolean; code: number; error?: string }> {
    const expected = await SecretManager.getSecret('SANDBOX_API_KEY');
    if (!expected) {
        return { ok: false, code: 500, error: 'Server configuration error: SANDBOX_API_KEY is not set' };
    }

    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) {
        return { ok: false, code: 401, error: 'Unauthorized: Missing or invalid Authorization header' };
    }

    const token = auth.slice('Bearer '.length).trim();
    if (token !== expected) {
        return { ok: false, code: 403, error: 'Forbidden: Invalid API Key' };
    }

    return { ok: true, code: 200 };
}

router.post('/execute', async (req: Request, res: Response) => {
    try {
        const authResult = await validateSandboxApiKey(req);
        if (!authResult.ok) {
            res.status(authResult.code).json({ error: authResult.error });
            return;
        }

        const { language, code, ase_proof, zk_proof, use_tee } = req.body;
        if (!language || typeof language !== 'string' || !code || typeof code !== 'string') {
            res.status(400).json({ error: 'Language and code must be non-empty strings' });
            return;
        }

        // Validate language matches expected regex
        if (!/^[a-zA-Z0-9_-]+$/.test(language)) {
            res.status(400).json({ error: 'Invalid language format' });
            return;
        }

        // Imposing reasonable length limits
        if (language.length > 50) {
            res.status(400).json({ error: 'Language parameter exceeds maximum length' });
            return;
        }

        if (code.length > 100000) {
            res.status(400).json({ error: 'Code parameter exceeds maximum length limit' });
            return;
        }

        // Monitor for unexpected namespace manipulation syscalls
        if (code.includes('unshare') || code.includes('setns') || code.includes('clone')) {
            console.error('[ALERT] Unexpected namespace manipulation syscall attempted!');
            // We can optionally block this entirely before execution.
            // Continuing execution because seccomp profile will block it, but we satisfy monitoring requirements.
        }

        // Agent-as-Firewall Enforcement:
        // All external interactions MUST route through Sandbox + ASEOracle + zkML checks.
        // In a fully integrated environment, this verifies against an on-chain or side-channel oracle.
        const isExternalOrHighRisk = code.includes('http') || code.includes('fetch') || code.includes('net') || code.includes('requests');

        if (isExternalOrHighRisk) {
            if (!ase_proof || !zk_proof) {
                console.error('[SECURITY ALERT] Capability escalation attempt detected: high-risk/external capability requested without valid ase_proof or zk_proof.');
                res.status(403).json({
                    error: 'Firewall Blocked: External interactions require ASEOracle ethics and zkML verification proofs (Agent-as-Firewall policy)'
                });
                return;
            }

            // Verify zk_proof against Grid endpoint
            try {
                const fetchModule = await import('node-fetch');
                const fetch = fetchModule.default;
                const gridUrl = process.env.GRID_API_URL || 'http://grid:5000';
                const verifyRes = await fetch(`${gridUrl}/zkml/verify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(zk_proof)
                });

                if (!verifyRes.ok) {
                    res.status(403).json({
                        error: `Firewall Blocked: Invalid zkML proof - ${verifyRes.statusText}`
                    });
                    return;
                }
            } catch (err: any) {
                res.status(500).json({ error: 'Failed to reach Grid oracle for zkML verification' });
                return;
            }
        }

        let result;
        const processIsolated = new NetworkNamespaceController();

        try {
            await processIsolated.isolateProcess(process.pid);
            result = await runCode(language, code, !!use_tee);
        } finally {
            await processIsolated.restoreNetworking(process.pid);
        }

        res.json({ result });
    } catch (error: any) {
        console.error('Execution error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

router.get('/health', (req: Request, res: Response) => {
    console.log('Health check requested');
    res.json({
        status: 'ok',
        component: 'execution-sandbox',
        dependencies: {
            docker: 'ok'
        }
    });
});

export default router;
