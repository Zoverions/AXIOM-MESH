import { isOriginAllowed, parseAllowedOrigins, parseByteLimit } from './security';

describe('security config helpers', () => {
    describe('parseAllowedOrigins', () => {
        it('returns trimmed explicit origins when env var is set', () => {
            expect(parseAllowedOrigins('https://a.test, https://b.test ', 3000)).toEqual([
                'https://a.test',
                'https://b.test',
            ]);
        });

        it('returns localhost defaults when env var is not set', () => {
            expect(parseAllowedOrigins(undefined, 4321)).toEqual([
                'http://localhost:4321',
                'http://127.0.0.1:4321',
            ]);
        });
    });

    describe('isOriginAllowed', () => {
        it('allows matching origin', () => {
            expect(isOriginAllowed('https://a.test', ['https://a.test'], 'production', 'false')).toBe(true);
        });

        it('denies missing origin unless explicitly allowed', () => {
            expect(isOriginAllowed(undefined, ['https://a.test'], 'production', 'false')).toBe(false);
            expect(isOriginAllowed(undefined, ['*'], 'production', 'false')).toBe(true);
            expect(isOriginAllowed(undefined, ['https://a.test'], 'production', 'true')).toBe(true);
        });

        it('allows all origins in test mode', () => {
            expect(isOriginAllowed('https://random.test', ['https://a.test'], 'test', 'false')).toBe(true);
        });
    });

    describe('parseByteLimit', () => {
        it('uses fallback for invalid or empty values', () => {
            expect(parseByteLimit(undefined, 100)).toBe(100);
            expect(parseByteLimit('bad', 100)).toBe(100);
            expect(parseByteLimit('0', 100)).toBe(100);
        });

        it('uses parsed positive integer value', () => {
            expect(parseByteLimit('2048', 100)).toBe(2048);
        });
    });
});
