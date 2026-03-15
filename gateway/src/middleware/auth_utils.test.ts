import { extractApiKeyToken, validateGatewayApiKey } from './auth_utils';

describe('auth utils', () => {
    it('prefers query token over headers', () => {
        const token = extractApiKeyToken({
            queryApiKey: 'query-key',
            authorizationHeader: 'Bearer header-key',
            xApiKeyHeader: 'x-key'
        });

        expect(token).toBe('query-key');
    });

    it('uses x-api-key when query is missing', () => {
        const token = extractApiKeyToken({
            xApiKeyHeader: 'x-key',
            authorizationHeader: 'Bearer header-key'
        });

        expect(token).toBe('x-key');
    });

    it('extracts bearer token', () => {
        const token = extractApiKeyToken({
            authorizationHeader: 'Bearer bearer-key'
        });

        expect(token).toBe('bearer-key');
    });

    it('validates configured key', () => {
        expect(validateGatewayApiKey('ok', 'ok').ok).toBe(true);
        expect(validateGatewayApiKey(undefined, 'ok')).toMatchObject({ ok: false, code: 401 });
        expect(validateGatewayApiKey('wrong', 'ok')).toMatchObject({ ok: false, code: 403 });
        expect(validateGatewayApiKey('ok', undefined)).toMatchObject({ ok: false, code: 500 });
    });
});
