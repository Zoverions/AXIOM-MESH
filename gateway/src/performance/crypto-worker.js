const { parentPort } = require('worker_threads');
const crypto = require('crypto');

if (parentPort) {
  parentPort.on('message', (task) => {
    try {
      if (task.type === 'hash') {
        const hash = crypto.createHash('sha256');
        hash.update(JSON.stringify(task.data));
        const result = hash.digest('hex');
        parentPort.postMessage({ hash: result });
      } else {
        parentPort.postMessage({ error: 'Unknown task type' });
      }
    } catch (e) {
      parentPort.postMessage({ error: e.message });
    }
  });
}
