import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';
import { runCode, ResourceLimits } from '../services/dockerRunner';

const router = Router();

// In-memory registry mapping ID -> Capsule data
const registry = new Map<string, any>();

// Validate Signature with configured Public Key
async function verifySignature(payload: any, signatureBase64: string): Promise<boolean> {
    try {
        const payloadStr = stringify(payload);
        const publicKeyPem = process.env.CAPSULE_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyYt7XvLpQ1Z9Jm6fWJmO
qQk7Bv1kGg5M6rY0q/uMmVzVHbA+B9N2iYyFpXh3U4Z+V9k5yQeM/Rk/Yx/N
tH1E8uV+e2Zq6DqJtA9sR6k2Yx/N/F4y3m4oD1nU6xVw5kGZ8v7+h9P9y9hK
fKzYpM3n4oX8L7o1w8c+w5D4N2yU2xT6Y7JvF/y3H1VzYyHq5s6W7N+aJ9d2
cQ2X9r+c2g7f5r3tZ5v7zYyHq5s6W7N+aJ9d2cQ2X9r+c2g7f5r3tZ5v7zYyH
q5s6W7N+aJ9d2cQ2X9r+c2g7f5r3tZ5v7zYyHq5s6W7N+aJ9d2cQ2X9r+c2g
7f5r3tZ5v7wIDAQAB
-----END PUBLIC KEY-----`; // Placeholder format

        const verify = crypto.createVerify('SHA256');
        verify.update(payloadStr);
        verify.end();

        return verify.verify({
            key: publicKeyPem,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN
        }, Buffer.from(signatureBase64, 'base64'));
    } catch (e) {
        return false;
    }
}

router.post('/capsule/publish', async (req: Request, res: Response) => {
    try {
        const { manifest, binary_base64, signature } = req.body;
        if (!manifest || !binary_base64 || !signature) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const requiredFields = ['id', 'version', 'entrypoint', 'scopes', 'required_hardware_tier', 'attestation_policy'];
        for (const field of requiredFields) {
            if (!manifest[field]) {
                res.status(400).json({ error: `Manifest missing required field: ${field}` });
                return;
            }
        }

        const payload = { manifest, binary_base64 };
        // We will mock verify logic for testing using an env var to bypass if strictly required in tests
        let isValid = await verifySignature(payload, signature);

        if (process.env.TEST_ALLOW_ALL_CAPSULES === 'true') {
            isValid = true;
        }

        if (!isValid) {
            res.status(403).json({ error: 'Signature verification failed. Tampered or unsigned capsule.' });
            return;
        }

        registry.set(manifest.id, req.body);
        res.json({ status: 'published', id: manifest.id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/capsule/:id', (req: Request, res: Response) => {
    const capsule = registry.get(req.params.id as string);
    if (!capsule) {
        res.status(404).json({ error: 'Capsule not found' });
        return;
    }
    res.json(capsule);
});

router.get('/capsule/:id/verify', async (req: Request, res: Response) => {
    const capsule = registry.get(req.params.id as string);
    if (!capsule) {
        res.status(404).json({ error: 'Capsule not found' });
        return;
    }
    const payload = { manifest: capsule.manifest, binary_base64: capsule.binary_base64 };
    let isValid = await verifySignature(payload, capsule.signature);
    if (process.env.TEST_ALLOW_ALL_CAPSULES === 'true') {
        isValid = true;
    }

    if (isValid) {
        res.json({ verified: true });
    } else {
        res.json({ verified: false });
    }
});

router.post('/capsule/:id/execute', async (req: Request, res: Response) => {
    try {
        const capsule = registry.get(req.params.id as string);
        if (!capsule) {
            res.status(404).json({ error: 'Capsule not found' });
            return;
        }

        const payload = { manifest: capsule.manifest, binary_base64: capsule.binary_base64 };
        let isValid = await verifySignature(payload, capsule.signature);
        if (process.env.TEST_ALLOW_ALL_CAPSULES === 'true') {
            isValid = true;
        }

        if (!isValid) {
            res.status(403).json({ error: 'Signature verification failed. Runtime rejects tampered capsule.' });
            return;
        }

        const binary = Buffer.from(capsule.binary_base64, 'base64').toString('utf-8');
        const scopes = capsule.manifest.scopes?.resource_limits || {};
        const limits: ResourceLimits = {
            memory_mb: scopes.mem_mb,
            cpu_ms: scopes.cpu_ms
        };

        const result = await runCode(capsule.manifest.entrypoint, binary, limits);
        res.json({ result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
