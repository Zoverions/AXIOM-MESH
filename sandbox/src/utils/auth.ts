import { Request } from 'express';
import { SecretManager } from './secrets';
import * as crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';

const nonceCache = new Map<string, number>();
const nonceTtlMs = Number(process.env.NONCE_TTL_MS || 300000);

let redisClientPromise: Promise<any | null> | null = null;

async function getRedisClient(): Promise<any | null> {
    if (redisClientPromise) {
        return redisClientPromise;
    }

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        redisClientPromise = Promise.resolve(null);
        return redisClientPromise;
    }

    redisClientPromise = (async () => {
        try {
            const redisModule = await import('redis');
            const client = redisModule.createClient({ url: redisUrl });
            client.on('error', (err: Error) => console.error(`Redis client error: ${err.message}`));
            await client.connect();
            return client;
        } catch (err) {
            console.error(`Failed to initialize Redis nonce store: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    })();

    return redisClientPromise;
}

async function registerNonce(nonce: string, now: number): Promise<boolean> {
    const redisClient = await getRedisClient();
    if (redisClient) {
        const key = `sandbox:nonce:${nonce}`;
        const didSet = await redisClient.set(key, String(now), { NX: true, PX: nonceTtlMs });
        return didSet === 'OK';
    }

    if (nonceCache.has(nonce)) {
        return false;
    }

    nonceCache.set(nonce, now);
    if (nonceCache.size > 10000) {
        for (const [k, v] of nonceCache.entries()) {
            if (now - v > nonceTtlMs) {
                nonceCache.delete(k);
            }
        }
    }
    return true;
}

export async function validateSandboxApiKey(req: Request): Promise<{ ok: boolean; code: number; error?: string }> {
    const expected = await SecretManager.getSecret('SANDBOX_API_KEY');
    if (!expected) {
        return { ok: false, code: 500, error: 'Server configuration error: SANDBOX_API_KEY is not set' };
    }

    const timestampStr = req.headers['x-axiom-timestamp'] as string;
    const nonce = req.headers['x-axiom-nonce'] as string;
    const signature = req.headers['x-axiom-signature'] as string;

    if (!timestampStr || !nonce || !signature) {
        return { ok: false, code: 403, error: 'Forbidden: Missing required signature headers' };
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
        return { ok: false, code: 400, error: 'Bad Request: Invalid timestamp format' };
    }

    const now = Date.now();
    if (Math.abs(now - timestamp) > nonceTtlMs) {
        return { ok: false, code: 403, error: 'Forbidden: Request signature expired' };
    }

    const nonceAccepted = await registerNonce(nonce, now);
    if (!nonceAccepted) {
        return { ok: false, code: 403, error: 'Forbidden: Replay attack detected: duplicate nonce' };
    }

    let payloadStr = '';
    const rawReq = req as any;
    if (rawReq.rawBody !== undefined) {
        payloadStr = rawReq.rawBody;
    } else if (req.body && Object.keys(req.body).length > 0) {
        // Fallback for requests that somehow bypassed rawBody (e.g., standard internal mocking)
        payloadStr = stringify(req.body);
    }

    const payload = `${timestampStr}:${nonce}:${payloadStr}`;
    const hmac = crypto.createHmac('sha256', expected);
    hmac.update(payload);
    const expectedMac = hmac.digest('hex');

    // Constant-time signature comparison to reduce timing side-channel leakage.
    const expectedBuf = Buffer.from(expectedMac, 'hex');
    const providedBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
        console.error('SERVER MAC FAILED for request signature validation');
        return { ok: false, code: 403, error: 'Forbidden: Invalid request signature' };
    }

    return { ok: true, code: 200 };
}
