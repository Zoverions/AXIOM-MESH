import { Router, Request, Response } from 'express';
import { normalizeInput } from '../utils/normalizer';
import { sendToHypervisor } from '../services/hypervisorClient';

const router = Router();

router.post('/api/v1/intent/process', async (req: Request, res: Response) => {
    try {
        const { channel, content, metadata } = req.body;
        if (!content) {
            res.status(400).json({ error: 'Content is required' });
            return;
        }

        const intent = normalizeInput(channel || 'api', content, metadata);
        const response = await sendToHypervisor(intent);

        res.json(response);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', component: 'omni-gateway' });
});

export default router;
