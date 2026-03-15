import { IncomingHttpHeaders } from 'http';

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

    if (token !== configuredApiKey) {
        return { ok: false, code: 403, error: 'Forbidden: Invalid API Key' };
    }

    return { ok: true, code: 200 };
}
