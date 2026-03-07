import { Router, Request, Response } from 'express';
import { runCode } from '../services/dockerRunner';

const router = Router();

router.post('/execute', async (req: Request, res: Response) => {
    try {
        const { language, code } = req.body;
        if (!language || !code) {
            res.status(400).json({ error: 'Language and code are required' });
            return;
        }

        const result = await runCode(language, code);
        res.json({ result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', component: 'execution-sandbox' });
});

export default router;
