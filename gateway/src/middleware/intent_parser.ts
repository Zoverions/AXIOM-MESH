import { z } from 'zod';
import { sanitizeContent } from '../utils/sanitize';

const intentSchema = z.object({
    id: z.string().optional(),
    session_id: z.string().optional(),
    conversation_id: z.string().optional(),
    actor_id: z.string().optional(),
    identity_hash: z.string().optional(),
    modality: z.string().optional(),
    consent_scope: z.enum(['allowed', 'context_only', 'revoked']).optional(),
    input: z.string(),
    timestamp: z.number().optional(),
});

export type ParsedIntent = z.infer<typeof intentSchema>;

export function parseAndSanitizeIntent(rawJson: string): ParsedIntent {
    const data = JSON.parse(rawJson);
    const parsed = intentSchema.parse(data);

    // NOTE: This is payload hygiene, not a full application firewall.
    parsed.input = sanitizeContent(parsed.input);

    return parsed;
}
