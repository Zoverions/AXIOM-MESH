import { Request } from 'express';
import { SecretManager } from './secrets';
import * as crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';

const nonceCache = new Map<string, number>();

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
    if (Math.abs(now - timestamp) > 300000) {
        return { ok: false, code: 403, error: 'Forbidden: Request signature expired' };
    }

    if (nonceCache.has(nonce)) {
        return { ok: false, code: 403, error: 'Forbidden: Replay attack detected: duplicate nonce' };
    }

    nonceCache.set(nonce, now);

    if (nonceCache.size > 10000) {
        for (const [k, v] of nonceCache.entries()) {
            if (now - v > 300000) {
                nonceCache.delete(k);
            }
        }
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
    console.error("SERVER HASHING:\nPAYLOAD: '" + payload + "'\nKEY: '" + expected + "'\nMAC: " + expectedMac);

    if (expectedMac !== signature) {
        console.error('SERVER MAC FAILED! \nKEY:', expected, '\nPAYLOAD:', payload, '\nSIG:', signature, '\nEXPECTED:', expectedMac);
        console.error('SERVER EXPECTEDMAC FAILED ON PAYLOAD: "', payloadStr, '"');
        return { ok: false, code: 403, error: 'Forbidden: Invalid request signature' };
    }

    return { ok: true, code: 200 };
}
