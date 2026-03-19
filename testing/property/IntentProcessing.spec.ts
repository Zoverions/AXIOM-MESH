const fc = require('fast-check');

import { parseAndSanitizeIntent } from '../../gateway/src/middleware/intent_parser';

describe('Intent Processing Properties', () => {
  it('should always parse or explicitly throw an error rather than crash', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          conversation_id: fc.string(),
          actor_id: fc.string({ minLength: 1 }),
          payload: fc.object(),
          input: fc.string()
        }),
        async (intent: any) => {
          try {
            const rawJson = JSON.stringify(intent);
            const result = await parseAndSanitizeIntent(rawJson);
            // If it succeeds, the input string must be sanitized or kept
            return typeof result.input === 'string';
          } catch (e: any) {
            // It is valid property behavior to throw standard errors for malformed intents
            // The key is that the event loop does not crash
            return e.message.includes('Validation Error') || e.message.includes('MCP Firewall blocked intent');
          }
        }
      )
    );
  });
});
