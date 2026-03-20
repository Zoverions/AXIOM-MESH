import { Request } from 'express';
import { SecretManager } from './secrets';

export async function validateSandboxApiKey(req: Request): Promise<{ ok: boolean; code: number; error?: string }> {
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
