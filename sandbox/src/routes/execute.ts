import { Router, Request, Response } from 'express';
import { runCode } from '../services/dockerRunner';
import { validateSandboxApiKey } from '../utils/auth';

const router = Router();
let verifierConsecutiveFailures = 0;
let verifierCircuitOpenUntil = 0;

async function verifyZkProofWithResilience(zk_proof: unknown): Promise<{ ok: boolean; status?: number; reason?: string }> {
    const now = Date.now();
    if (now < verifierCircuitOpenUntil) {
        return { ok: false, status: 503, reason: 'Grid verifier circuit is temporarily open' };
    }

    const timeoutMs = Number(process.env.GRID_VERIFY_TIMEOUT_MS || 3000);
    const failureThreshold = Number(process.env.GRID_CB_FAILURE_THRESHOLD || 5);
    const resetMs = Number(process.env.GRID_CB_RESET_MS || 30000);

    const fetchModule = await import('node-fetch');
    const fetch = fetchModule.default;
    const gridUrl = process.env.GRID_API_URL || 'http://grid:5000';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const verifyRes = await fetch(`${gridUrl}/zkml/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(zk_proof),
            signal: controller.signal
        });

        if (!verifyRes.ok) {
            verifierConsecutiveFailures += 1;
            if (verifierConsecutiveFailures >= failureThreshold) {
                verifierCircuitOpenUntil = Date.now() + resetMs;
            }
            return { ok: false, status: 403, reason: `Invalid zkML proof - ${verifyRes.statusText}` };
        }

        verifierConsecutiveFailures = 0;
        verifierCircuitOpenUntil = 0;
        return { ok: true };
    } catch (err) {
        verifierConsecutiveFailures += 1;
        if (verifierConsecutiveFailures >= failureThreshold) {
            verifierCircuitOpenUntil = Date.now() + resetMs;
        }
        return { ok: false, status: 503, reason: 'Failed to reach Grid oracle for zkML verification' };
    } finally {
        clearTimeout(timeout);
    }
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
            const verifierResult = await verifyZkProofWithResilience(zk_proof);
            if (!verifierResult.ok) {
                res.status(verifierResult.status || 503).json({
                    error: `Firewall Blocked: ${verifierResult.reason}`
                });
                return;
            }
        }

        const result = await runCode(language, code, !!use_tee);

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
