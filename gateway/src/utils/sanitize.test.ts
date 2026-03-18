import { sanitizeContent, sanitizeMetadata } from './sanitize';

describe('sanitize utilities', () => {
  test('sanitizeContent strips script/html/sql comment tokens', () => {
    const raw = '<script>alert(1)</script><b>Hello</b>; DROP -- table';
    expect(sanitizeContent(raw)).toBe('Hello DROP table');
  });

  test('sanitizeMetadata keeps nested structures with truncation rules', () => {
    const metadata = {
      channel: '<b>web</b>',
      nested: {
        tags: ['<script>x</script>safe', 'ok'],
      },
    };

    const sanitized = sanitizeMetadata(metadata);
    expect(sanitized.channel).toBe('web');
    expect((sanitized.nested as any).tags[0]).toBe('safe');
  });
});
