const { parentPort } = require('worker_threads');
const crypto = require('crypto');
const { z } = require('zod');

// Pre-compile Zod schema
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

if (parentPort) {
  parentPort.on('message', (task) => {
    try {
      if (task.type === 'hash') {
        const hash = crypto.createHash('sha256');
        hash.update(JSON.stringify(task.data));
        const result = hash.digest('hex');
        parentPort.postMessage({ id: task.id, hash: result });
      } else if (task.type === 'hmac') {
        const hmac = crypto.createHmac('sha256', task.data.key);
        hmac.update(task.data.payload);
        const result = hmac.digest('hex');
        parentPort.postMessage({ id: task.id, hash: result }); // use hash property to pass the result
      } else if (task.type === 'validate') {
        try {
          const data = JSON.parse(task.data);
          const result = intentSchema.safeParse(data);
          if (result.success) {
            parentPort.postMessage({ id: task.id, parsed: result.data });
          } else {
            parentPort.postMessage({ id: task.id, error: result.error.message });
          }
        } catch (err) {
            parentPort.postMessage({ id: task.id, error: err.message });
        }
      } else {
        parentPort.postMessage({ id: task.id, error: 'Unknown task type' });
      }
    } catch (e) {
      parentPort.postMessage({ id: task.id, error: e.message });
    }
  });
}
