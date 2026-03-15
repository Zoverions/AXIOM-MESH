import { Channel, DeliveryReceipt, ReliabilityPolicy } from './registry';

interface QueueItem {
    chatId: string;
    text: string;
    resolve: (receipt: DeliveryReceipt) => void;
}

export abstract class BaseChannel implements Channel {
    abstract name: string;
    abstract reliabilityPolicy: ReliabilityPolicy;

    private queue: QueueItem[] = [];
    private isProcessingQueue = false;

    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;

    /**
     * Implementing classes must provide this method.
     * It should return the messageId on success, or throw an error on failure.
     */
    protected abstract doSendMessage(chatId: string, text: string): Promise<string | undefined>;

    public async sendMessage(chatId: string, text: string): Promise<DeliveryReceipt> {
        return new Promise<DeliveryReceipt>((resolve) => {
            this.queue.push({ chatId, text, resolve });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();
            if (!item) continue;

            const receipt = await this.sendWithRetries(item.chatId, item.text);
            item.resolve(receipt);

            if (this.queue.length > 0 && this.reliabilityPolicy.rateLimitMs > 0) {
                await this.delay(this.reliabilityPolicy.rateLimitMs);
            }
        }

        this.isProcessingQueue = false;
    }

    private async sendWithRetries(chatId: string, text: string): Promise<DeliveryReceipt> {
        let attempts = 0;
        let lastError: Error | unknown;

        while (attempts <= this.reliabilityPolicy.maxRetries) {
            try {
                const messageId = await this.doSendMessage(chatId, text);
                return {
                    success: true,
                    messageId,
                    timestamp: Date.now(),
                    attempts: attempts + 1,
                    provider: this.name,
                    acknowledged: this.reliabilityPolicy.enforceDeliveryReceipt ? Boolean(messageId) : true,
                };
            } catch (err: any) {
                lastError = err;
                attempts++;

                const isRateLimited = this.reliabilityPolicy.classifyRateLimitError
                    ? this.reliabilityPolicy.classifyRateLimitError(err)
                    : this.defaultRateLimitClassifier(err);

                if (attempts <= this.reliabilityPolicy.maxRetries) {
                    const baseDelay = this.reliabilityPolicy.retryDelayMs * Math.pow(2, attempts - 1);
                    const delayMs = isRateLimited ? Math.max(baseDelay, this.reliabilityPolicy.rateLimitMs) : baseDelay;
                    console.warn(`[${this.name}] Send failed to ${chatId}. Retrying in ${delayMs}ms (Attempt ${attempts}/${this.reliabilityPolicy.maxRetries}). Error: ${err.message || err}`);
                    await this.delay(delayMs);
                }
            }
        }

        const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
        console.error(`[${this.name}] Failed to send message to ${chatId} after ${this.reliabilityPolicy.maxRetries} retries. Final error: ${errorMessage}`);

        const isRateLimited = this.reliabilityPolicy.classifyRateLimitError
            ? this.reliabilityPolicy.classifyRateLimitError(lastError)
            : this.defaultRateLimitClassifier(lastError);

        return {
            success: false,
            error: errorMessage,
            timestamp: Date.now(),
            attempts,
            provider: this.name,
            acknowledged: false,
            rateLimited: isRateLimited,
        };
    }

    private defaultRateLimitClassifier(err: unknown): boolean {
        const raw = err instanceof Error ? err.message : String(err);
        return /rate\s*limit|too many requests|429/i.test(raw);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
