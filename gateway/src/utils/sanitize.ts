import xss from 'xss';

const MAX_CONTENT_LENGTH = Number(process.env.GATEWAY_MAX_CONTENT_LENGTH || 4000);
const MAX_METADATA_DEPTH = 3;

const SQL_COMMENT_TOKENS = /(--|;|\/\*|\*\/)/g;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

function sanitizeString(value: string): string {
    // Use xss to strip all HTML tags and script payloads
    const noHtml = xss(value, {
        whiteList: {}, // empty means no tags allowed
        stripIgnoreTag: true, // strip all tags entirely, not just escape them
        stripIgnoreTagBody: ['script', 'style'] // remove the content of script and style tags
    });

    const cleaned = noHtml
        .replace(SQL_COMMENT_TOKENS, '')
        .replace(CONTROL_CHARS, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return cleaned.slice(0, MAX_CONTENT_LENGTH);
}

function sanitizeUnknown(value: unknown, depth = 0): unknown {
    if (depth > MAX_METADATA_DEPTH) {
        return '[truncated]';
    }

    if (typeof value === 'string') {
        return sanitizeString(value);
    }

    if (Array.isArray(value)) {
        return value.slice(0, 25).map((entry) => sanitizeUnknown(entry, depth + 1));
    }

    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            const sanitizedKey = sanitizeString(key).slice(0, 64);
            if (sanitizedKey.length === 0) {
                continue;
            }
            out[sanitizedKey] = sanitizeUnknown(item, depth + 1);
        }
        return out;
    }

    return value;
}

export function sanitizeContent(content: unknown): string {
    if (typeof content !== 'string') {
        return '';
    }
    return sanitizeString(content);
}

export function sanitizeMetadata(metadata: unknown): Record<string, unknown> {
    const sanitized = sanitizeUnknown(metadata);
    if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
        return {};
    }
    return sanitized as Record<string, unknown>;
}
