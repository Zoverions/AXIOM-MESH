import { z } from 'zod';

const intentSchema = z.object({
    id: z.string(),
    identity_hash: z.string(),
    modality: z.string(),
    input: z.string(),
    timestamp: z.number(),
});

export type ParsedIntent = z.infer<typeof intentSchema>;

export function parseAndSanitizeIntent(rawJson: string): ParsedIntent {
    const data = JSON.parse(rawJson);
    const parsed = intentSchema.parse(data);

    // Basic sanitization: strip dangerous HTML/script tags and obvious SQLi patterns
    parsed.input = parsed.input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]*>?/gm, '') // Strip basic HTML tags
        .replace(/(--|;|\/\*|\*\/)/g, ''); // Strip basic SQL injection characters like --, ;, /*, */

    return parsed;
}
