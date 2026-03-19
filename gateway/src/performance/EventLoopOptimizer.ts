import { Worker } from 'worker_threads';
import { randomBytes } from 'crypto';
import { promisify } from 'util';
import path from 'path';
import { WebSocket } from 'ws';
import { z } from 'zod';

export const asyncRandomBytes = promisify(randomBytes);

export interface CryptoTask {
  id: string;
  type: 'hash' | 'validate' | 'hmac';
  data: any;
}

export class CryptoWorkerPool {
  private workers: Worker[];
  private callbacks: Map<string, { resolve: Function; reject: Function }> = new Map();
  private currentWorker = 0;

  constructor(poolSize: number = 4) {
    this.workers = Array(poolSize).fill(null).map(() => {
      const worker = new Worker(path.join(__dirname, 'crypto-worker.js'));
      worker.on('message', (result) => {
        const item = this.callbacks.get(result.id);
        if (!item) return;

        this.callbacks.delete(result.id);

        if (result.error) {
           item.reject(new Error(result.error));
        } else {
           if (result.hash) {
             item.resolve(result.hash);
           } else if (result.parsed) {
             item.resolve(result.parsed);
           } else {
             item.resolve(result);
           }
        }
      });
      return worker;
    });
  }

  async hmacSignature(key: string, payload: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const taskId = randomBytes(16).toString('hex');
      const task: CryptoTask = { id: taskId, type: 'hmac', data: { key, payload } };
      this.callbacks.set(taskId, { resolve, reject });

      const worker = this.workers[this.currentWorker];
      worker.postMessage(task);
      this.currentWorker = (this.currentWorker + 1) % this.workers.length;
    });
  }

  async hashIntent(intent: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const taskId = randomBytes(16).toString('hex');
      const task: CryptoTask = { id: taskId, type: 'hash', data: intent };
      this.callbacks.set(taskId, { resolve, reject });

      const worker = this.workers[this.currentWorker];
      worker.postMessage(task);
      this.currentWorker = (this.currentWorker + 1) % this.workers.length;
    });
  }

  async validateAndParse(rawJson: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const taskId = randomBytes(16).toString('hex');
      const task: CryptoTask = { id: taskId, type: 'validate', data: rawJson };
      this.callbacks.set(taskId, { resolve, reject });

      const worker = this.workers[this.currentWorker];
      worker.postMessage(task);
      this.currentWorker = (this.currentWorker + 1) % this.workers.length;
    });
  }
}

export class BackpressureWebSocket {
  private bufferSize: number = 0;
  private readonly MAX_BUFFER_SIZE: number = 1024 * 1024; // 1MB
  private isPaused: boolean = false;

  constructor(private ws: WebSocket) {}

  send(data: string): boolean {
    const dataLength = Buffer.byteLength(data);
    this.bufferSize += dataLength;

    if (this.bufferSize >= this.MAX_BUFFER_SIZE && !this.isPaused) {
      this.ws.pause();
      this.isPaused = true;
    }

    const result = this.ws.send(data, (err) => {
      if (!err) {
        this.bufferSize -= dataLength;
        if (this.bufferSize < this.MAX_BUFFER_SIZE && this.isPaused) {
          this.ws.resume();
          this.isPaused = false;
        }
      }
    });

    // If buffer is over limit, backpressure is active
    return this.bufferSize < this.MAX_BUFFER_SIZE;
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
