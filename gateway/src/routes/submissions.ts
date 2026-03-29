import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../middleware/auth';

type SubmissionStatus = 'pending_review' | 'approved' | 'rejected' | 'merged';

interface SubmissionRecord {
    id: string;
    topic: string;
    ipfsCid: string;
    canonicalPath: string;
    submittedBy: string;
    submittedAt: string;
    status: SubmissionStatus;
    reviewer?: string;
    reviewNotes?: string;
    reviewedAt?: string;
    mergedAt?: string;
}

const router = Router();
const registryPath = path.join(process.cwd(), 'data', 'submission_registry.json');

function readRegistry(): SubmissionRecord[] {
    if (!fs.existsSync(registryPath)) return [];
    return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
}

function writeRegistry(records: SubmissionRecord[]): void {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify(records, null, 2));
}

router.post('/', authMiddleware, (req: Request, res: Response) => {
    const { topic, ipfsCid, canonicalPath, submittedBy } = req.body || {};
    if (!topic || !ipfsCid || !canonicalPath || !submittedBy) {
        return res.status(400).json({ error: 'topic, ipfsCid, canonicalPath, and submittedBy are required' });
    }

    const records = readRegistry();
    const id = `sub-${Date.now()}`;
    const now = new Date().toISOString();
    const entry: SubmissionRecord = {
        id,
        topic,
        ipfsCid,
        canonicalPath,
        submittedBy,
        submittedAt: now,
        status: 'pending_review'
    };

    records.push(entry);
    writeRegistry(records);
    res.status(201).json(entry);
});

router.post('/:id/review', authMiddleware, (req: Request, res: Response) => {
    const { id } = req.params;
    const { decision, reviewer, reviewNotes } = req.body || {};
    if (!decision || !['approved', 'rejected'].includes(decision) || !reviewer) {
        return res.status(400).json({ error: 'decision must be approved/rejected and reviewer is required' });
    }

    const records = readRegistry();
    const target = records.find((item) => item.id === id);
    if (!target) return res.status(404).json({ error: 'submission not found' });
    if (target.status !== 'pending_review') {
        return res.status(409).json({ error: `submission is already ${target.status}` });
    }

    target.status = decision;
    target.reviewer = reviewer;
    target.reviewNotes = reviewNotes || '';
    target.reviewedAt = new Date().toISOString();
    writeRegistry(records);
    res.json(target);
});

router.post('/:id/merge', authMiddleware, (req: Request, res: Response) => {
    const { id } = req.params;
    const records = readRegistry();
    const target = records.find((item) => item.id === id);
    if (!target) return res.status(404).json({ error: 'submission not found' });
    if (target.status !== 'approved') {
        return res.status(409).json({ error: 'submission must be approved before merge' });
    }

    target.status = 'merged';
    target.mergedAt = new Date().toISOString();
    writeRegistry(records);
    res.json(target);
});

router.get('/', authMiddleware, (req: Request, res: Response) => {
    res.json({ submissions: readRegistry() });
});

export default router;
