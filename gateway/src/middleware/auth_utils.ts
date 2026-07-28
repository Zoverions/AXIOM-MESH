import { IncomingHttpHeaders } from 'http';
import * as jwt from 'jsonwebtoken';

export type AuthSource = {
    queryApiKey?: string | null;
    authorizationHeader?: string;
    xApiKeyHeader?: string;
};

export function extractApiKeyToken(source: AuthSource): string | undefined {
    const queryToken = source.queryApiKey?.trim();
    if (queryToken) {
        return queryToken;
    }

    const xApiKey = source.xApiKeyHeader?.trim();
    if (xApiKey) {
        return xApiKey;
    }

    const authHeader = source.authorizationHeader?.trim();
    if (authHeader?.startsWith('Bearer ')) {
        const bearerToken = authHeader.slice('Bearer '.length).trim();
        if (bearerToken) {
            return bearerToken;
        }
    }

    return undefined;
}

export function extractApiKeyFromHeaders(headers: IncomingHttpHeaders, queryApiKey?: string | null): string | undefined {
    const authorizationHeader = typeof headers.authorization === 'string' ? headers.authorization : undefined;
    const xApiKeyHeader = typeof headers['x-api-key'] === 'string' ? headers['x-api-key'] : undefined;

    return extractApiKeyToken({
        queryApiKey,
        authorizationHeader,
        xApiKeyHeader
    });
}

export function validateGatewayApiKey(token: string | undefined, configuredApiKey: string | undefined): { ok: boolean; code: number; error?: string } {
    if (!configuredApiKey) {
        return { ok: false, code: 500, error: 'Server configuration error: GATEWAY_API_KEY is not set' };
    }

    if (!token) {
        return { ok: false, code: 401, error: 'Unauthorized: Missing API key token' };
    }

    // 1. Try to validate as API Key
    const validKeys = configuredApiKey.split(',').map(k => k.trim()).filter(k => k.length > 0);
    if (validKeys.includes(token)) {
        return { ok: true, code: 200 };
    }

    // 2. Try to validate as JWT if JWT_SECRET is configured
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) {
        try {
            jwt.verify(token, jwtSecret);
            return { ok: true, code: 200 };
        } catch (err: any) {
            // Token is either not a JWT or invalid JWT
            return { ok: false, code: 403, error: 'Forbidden: Invalid API Key or JWT' };
        }
    }

    return { ok: false, code: 403, error: 'Forbidden: Invalid API Key' };
}
