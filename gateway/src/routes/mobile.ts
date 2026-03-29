import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth';
import crypto from 'crypto';
import speakeasy from 'speakeasy';

const router = express.Router();

// In-memory store for sync sessions
const activeSyncSessions = new Map<string, {
    desktopPubKey: string;
    expiresAt: number;
    status: 'pending' | 'completed';
    androidPayload?: string;
}>();

// Garbage collection to prevent memory leaks from abandoned sessions
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of activeSyncSessions.entries()) {
        if (now > session.expiresAt) {
            activeSyncSessions.delete(sessionId);
        }
    }
}, 60000).unref(); // Clean up every minute, unref to not block tests

/**
 * @route POST /api/mobile/sync/init
 * @desc Desktop initiates a sync session, returns a session ID to render as QR code
 */
router.post('/sync/init', authMiddleware, (req: Request, res: Response) => {
    const { desktopPubKey } = req.body;
    if (!desktopPubKey) {
        return res.status(400).json({ error: 'desktopPubKey is required' });
    }

    const sessionId = uuidv4();
    activeSyncSessions.set(sessionId, {
        desktopPubKey,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes expiry
        status: 'pending'
    });

    res.json({
        sessionId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    });
});

/**
 * @route POST /api/mobile/sync/complete
 * @desc Android scans the QR and submits its encrypted payload to complete the sync
 */
router.post('/sync/complete', (req: Request, res: Response) => {
    const { sessionId, encryptedPayload } = req.body;

    if (!sessionId || !encryptedPayload) {
        return res.status(400).json({ error: 'sessionId and encryptedPayload are required' });
    }

    const session = activeSyncSessions.get(sessionId as string);
    if (!session) {
        return res.status(404).json({ error: 'Session not found or expired' });
    }

    if (Date.now() > session.expiresAt) {
        activeSyncSessions.delete(sessionId);
        return res.status(400).json({ error: 'Session expired' });
    }

    session.status = 'completed';
    session.androidPayload = encryptedPayload;

    res.json({ success: true, message: 'Sync completed' });
});

/**
 * @route GET /api/mobile/sync/status/:sessionId
 * @desc Desktop polls to check if Android has completed the sync
 */
router.get('/sync/status/:sessionId', authMiddleware, (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const session = activeSyncSessions.get(sessionId as string);

    if (!session) {
        return res.status(404).json({ error: 'Session not found or expired' });
    }

    if (session.status === 'completed') {
        const payload = session.androidPayload;
        activeSyncSessions.delete(sessionId as string); // One-time read
        return res.json({ status: 'completed', payload });
    }

    res.json({ status: 'pending' });
});

/**
 * @route GET /dashboard/mobile/data
 * @desc Serves basic wallet and achievement metadata for the Android dashboard
 */
router.get('/dashboard/data', authMiddleware, (req: Request, res: Response) => {
    // In a full implementation, this would query the Grid RPC or Hypervisor.
    // For the baseline expansion, we return structured mock data matching the schema.
    res.json({
        wallet: {
            address: "0xAndroidNode...",
            balance_axm: "150.00",
            staked_poer: "25.5"
        },
        achievements: [
            {
                id: "ontario-edu-1",
                name: "Ontario Grade 9 Math Completion",
                issuer: "OntarioEducationAttestor",
                issued_at: new Date().toISOString()
            }
        ],
        device_role: "minimal-edge",
        sync_status: "active"
    });
});

/**
 * @route POST /api/mobile/2fa/verify
 * @desc Validates a TOTP token against a securely stored secret using speakeasy
 */
router.post('/2fa/verify', (req: Request, res: Response) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }

    // In production, the secret MUST be securely fetched from the user's profile or DB
    // mapped to their authenticated identity.
    // For this single-node baseline, we use the server-configured env secret.
    const userSecret = process.env.AXIOM_TOTP_SECRET;

    if (!userSecret) {
         return res.status(500).json({ error: 'Server configuration error: TOTP secret unavailable' });
    }

    const verified = speakeasy.totp.verify({
        secret: userSecret,
        encoding: 'base32',
        token: token,
        window: 1 // Allow 1 step before/after to account for slight clock drift
    });

    if (verified) {
        res.json({ success: true, message: '2FA token verified' });
    } else {
        res.status(401).json({ success: false, error: 'Invalid 2FA token' });
    }
});

export default router;
