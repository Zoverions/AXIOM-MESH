import { extractApiKeyToken, validateGatewayApiKey } from './auth_utils';
import * as jwt from 'jsonwebtoken';

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

    it('handles edge cases for token extraction', () => {
        // Empty source
        expect(extractApiKeyToken({})).toBeUndefined();

        // Whitespace only values
        expect(extractApiKeyToken({ queryApiKey: '   ' })).toBeUndefined();
        expect(extractApiKeyToken({ xApiKeyHeader: '\t\n' })).toBeUndefined();

        // Case sensitivity for Bearer prefix
        expect(extractApiKeyToken({ authorizationHeader: 'bearer lowercase-key' })).toBeUndefined();

        // Bearer prefix without token
        expect(extractApiKeyToken({ authorizationHeader: 'Bearer ' })).toBeUndefined();
        expect(extractApiKeyToken({ authorizationHeader: 'Bearer   ' })).toBeUndefined();

        // Bearer with multiple spaces
        expect(extractApiKeyToken({ authorizationHeader: 'Bearer  extra-spaces' })).toBe('extra-spaces');

        // Mixed fields with empty values
        expect(extractApiKeyToken({
            queryApiKey: '  ',
            xApiKeyHeader: '',
            authorizationHeader: 'Bearer actual-token'
        })).toBe('actual-token');
    });

    it('validates configured key', () => {
        expect(validateGatewayApiKey('ok', 'ok').ok).toBe(true);
        expect(validateGatewayApiKey(undefined, 'ok')).toMatchObject({ ok: false, code: 401 });
        expect(validateGatewayApiKey('wrong', 'ok')).toMatchObject({ ok: false, code: 403 });
        expect(validateGatewayApiKey('ok', undefined)).toMatchObject({ ok: false, code: 500 });
    });

    it('validates multiple comma-separated keys for rotation', () => {
        const configuredKeys = 'key1, key2,key3';
        expect(validateGatewayApiKey('key1', configuredKeys).ok).toBe(true);
        expect(validateGatewayApiKey('key2', configuredKeys).ok).toBe(true);
        expect(validateGatewayApiKey('key3', configuredKeys).ok).toBe(true);
        expect(validateGatewayApiKey('key4', configuredKeys).ok).toBe(false);
        expect(validateGatewayApiKey('key4', configuredKeys).code).toBe(403);
    });

    it('validates valid JWT when JWT_SECRET is set', () => {
        const originalSecret = process.env.JWT_SECRET;
        process.env.JWT_SECRET = 'test-secret';

        const token = jwt.sign({ user: 'test' }, 'test-secret');
        expect(validateGatewayApiKey(token, 'ok').ok).toBe(true);

        process.env.JWT_SECRET = originalSecret;
    });

    it('fails to validate invalid JWT when JWT_SECRET is set', () => {
        const originalSecret = process.env.JWT_SECRET;
        process.env.JWT_SECRET = 'test-secret';

        const token = jwt.sign({ user: 'test' }, 'wrong-secret');
        const validation = validateGatewayApiKey(token, 'ok');
        expect(validation.ok).toBe(false);
        expect(validation.code).toBe(403);
        expect(validation.error).toBe('Forbidden: Invalid API Key or JWT');

        process.env.JWT_SECRET = originalSecret;
    });

    it('falls back to invalid API key error when JWT_SECRET is not set', () => {
        const originalSecret = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;

        const validation = validateGatewayApiKey('invalid-key-or-jwt', 'ok');
        expect(validation.ok).toBe(false);
        expect(validation.code).toBe(403);
        expect(validation.error).toBe('Forbidden: Invalid API Key');

        process.env.JWT_SECRET = originalSecret;
    });
});
