import { Channel, ChannelOpts, registerChannel } from './registry';

export class TelegramChannel implements Channel {
    name = 'telegram';
    private onMessage: (channelName: string, chatId: string, content: string, sender: string) => void;

    constructor(opts: ChannelOpts) {
        this.onMessage = opts.onMessage;
    }

    async connect(): Promise<void> {
        console.log('[Telegram] Connected successfully');
        // Simulated connection
    }

    async sendMessage(chatId: string, content: string): Promise<void> {
        console.log(`[Telegram] Sending message to ${chatId}: ${content}`);
    }

    async disconnect(): Promise<void> {
        console.log(`[Telegram] Disconnected`);
    }
}

registerChannel('telegram', (opts) => new TelegramChannel(opts));
