const { parentPort } = require('worker_threads');
const crypto = require('crypto');

if (parentPort) {
  parentPort.on('message', (task) => {
    try {
      if (task.type === 'hash') {
        const hash = crypto.createHash('sha256');
        hash.update(JSON.stringify(task.data));
        const result = hash.digest('hex');
        parentPort.postMessage({ id: task.id, hash: result });
      } else if (task.type === 'validate') {
        const { z } = require('zod');
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
        try {
          const data = JSON.parse(task.data);
          const parsed = intentSchema.parse(data);
          parentPort.postMessage({ id: task.id, parsed });
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
