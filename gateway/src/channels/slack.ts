import { Channel, ChannelOpts, registerChannel } from './registry';

export class SlackChannel implements Channel {
    name = 'slack';
    private onMessage: (channelName: string, chatId: string, content: string, sender: string) => void;

    constructor(opts: ChannelOpts) {
        this.onMessage = opts.onMessage;
    }

    async connect(): Promise<void> {
        console.log('[Slack] Connected successfully');
        // Simulated connection
    }

    async sendMessage(chatId: string, content: string): Promise<void> {
        console.log(`[Slack] Sending message to ${chatId}: ${content}`);
    }

    async disconnect(): Promise<void> {
        console.log(`[Slack] Disconnected`);
    }
}

registerChannel('slack', (opts) => new SlackChannel(opts));
