import { sanitizeContent } from '../utils/sanitize';

export type ParsedIntent = {
    id?: string;
    session_id?: string;
    conversation_id?: string;
    actor_id?: string;
    identity_hash?: string;
    modality?: string;
    consent_scope?: 'allowed' | 'context_only' | 'revoked';
    input: string;
    timestamp?: number;
};

import { CryptoWorkerPool } from '../performance/EventLoopOptimizer';
const workerPool = new CryptoWorkerPool(2);

export async function parseAndSanitizeIntent(rawJson: string): Promise<ParsedIntent> {
    // Offload JSON parsing and Zod validation to worker thread
    const parsed = await workerPool.validateAndParse(rawJson);

    // NOTE: This is payload hygiene, not a full application firewall.
    parsed.input = sanitizeContent(parsed.input);

    return parsed;
}
