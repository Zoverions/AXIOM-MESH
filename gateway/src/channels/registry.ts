export interface DeliveryReceipt {
    success: boolean;
    messageId?: string;
    error?: string;
    timestamp: number;
    attempts?: number;
    provider?: string;
    acknowledged?: boolean;
    rateLimited?: boolean;
}

export interface ReliabilityPolicy {
    maxRetries: number;
    retryDelayMs: number;
    rateLimitMs: number;
    enforceDeliveryReceipt: boolean;
    classifyRateLimitError?: (err: unknown) => boolean;
}

export interface Channel {
    name: string;
    reliabilityPolicy: ReliabilityPolicy;
    connect(): Promise<void>;
    sendMessage(chatId: string, text: string): Promise<DeliveryReceipt>;
    disconnect(): Promise<void>;
}

export type OnInboundMessage = (channelName: string, chatId: string, content: string, sender: string) => void;

export interface ChannelOpts {
    onMessage: OnInboundMessage;
}

export type ChannelFactory = (opts: ChannelOpts) => Channel | null;

const registry = new Map<string, ChannelFactory>();

export function registerChannel(name: string, factory: ChannelFactory): void {
    registry.set(name, factory);
}

export function getChannelFactory(name: string): ChannelFactory | undefined {
    return registry.get(name);
}

export function getRegisteredChannelNames(): string[] {
    return Array.from(registry.keys());
}
