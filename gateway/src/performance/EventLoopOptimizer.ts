import { Worker } from 'worker_threads';
import { randomBytes } from 'crypto';
import { promisify } from 'util';
import path from 'path';
import { WebSocket } from 'ws';
import { z } from 'zod';

export const asyncRandomBytes = promisify(randomBytes);

export interface CryptoTask {
  type: 'hash';
  data: any;
}

export class CryptoWorkerPool {
  private workers: Worker[];
  private queue: Array<{ task: CryptoTask; resolve: Function; reject: Function }> = [];
  private currentWorker = 0;

  constructor(poolSize: number = 4) {
    this.workers = Array(poolSize).fill(null).map(() => {
      // In TS/Node, the worker file could be JS or TS (using ts-node), we use JS for simplicity
      const worker = new Worker(path.join(__dirname, 'crypto-worker.js'));
      worker.on('message', (result) => {
        if (result.error) {
           // We would typically map tasks to an ID, but for this prototype we'll shift the first task
           const item = this.queue.shift();
           if (item) item.reject(new Error(result.error));
        } else {
           const item = this.queue.shift();
           if (item) item.resolve(result.hash);
        }
      });
      return worker;
    });
  }

  async hashIntent(intent: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const task: CryptoTask = { type: 'hash', data: intent };
      this.queue.push({ task, resolve, reject });

      const worker = this.workers[this.currentWorker];
      worker.postMessage(task);
      this.currentWorker = (this.currentWorker + 1) % this.workers.length;
    });
  }
}

export class BackpressureWebSocket {
  private bufferSize: number = 0;
  private readonly MAX_BUFFER_SIZE: number = 1024 * 1024; // 1MB

  constructor(private ws: WebSocket) {}

  send(data: string): boolean {
    if (this.bufferSize >= this.MAX_BUFFER_SIZE) {
      this.ws.pause();
      return false;
    }

    const result = this.ws.send(data, (err) => {
      if (!err) this.bufferSize -= Buffer.byteLength(data);
    });

    this.bufferSize += Buffer.byteLength(data);
    return result as unknown as boolean;
  }
}

const IntentSchema = z.object({
  conversation_id: z.string().uuid().optional(),
  actor_id: z.string().min(1).max(256).optional(),
  trace_id: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()).optional()
}); // Use .strict() if required, omitting here to avoid breaking existing payloads

export class ValidationError extends Error {
  constructor(public issues: any) {
    super("Validation Error");
  }
}

export function validateIntent(data: unknown): any {
  const result = IntentSchema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error.issues);
  }
  return result.data;
}
