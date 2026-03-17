import { Router, Request, Response } from 'express';
import { runCode } from '../services/dockerRunner';

const router = Router();

router.post('/execute', async (req: Request, res: Response) => {
    try {
        const { language, code, ase_proof, zk_proof } = req.body;
        if (!language || !code) {
            res.status(400).json({ error: 'Language and code are required' });
            return;
        }

        // Agent-as-Firewall Enforcement:
        // All external interactions MUST route through Sandbox + ASEOracle + zkML checks.
        // We mock the ASEOracle / zkML check here by requiring the proofs for external flows.
        // In a fully integrated environment, this verifies against an on-chain or side-channel oracle.
        const isExternalOrHighRisk = code.includes('http') || code.includes('fetch') || code.includes('net') || code.includes('requests');

        if (isExternalOrHighRisk) {
            if (!ase_proof || !zk_proof) {
                res.status(403).json({
                    error: 'Firewall Blocked: External interactions require ASEOracle ethics and zkML verification proofs (Agent-as-Firewall policy)'
                });
                return;
            }
        }

        const result = await runCode(language, code);
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
