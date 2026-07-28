import { App } from '@slack/bolt';
import { ChannelOpts, ReliabilityPolicy, registerChannel } from './registry';
import { BaseChannel } from './base';

export class SlackChannel extends BaseChannel {
    name = 'slack';
    reliabilityPolicy: ReliabilityPolicy = {
        maxRetries: 3,
        retryDelayMs: 1500,
        rateLimitMs: 1000, // Slack rate limits ~1 msg/sec
        enforceDeliveryReceipt: true,
        classifyRateLimitError: (err: unknown) => /rate[_ ]?limited|429|too many requests/i.test(String((err as any)?.message || err))
    };
    private app: App;
    private onMessage: (channelName: string, chatId: string, content: string, sender: string) => void;

    constructor(token: string, appToken: string, opts: ChannelOpts) {
        super();
        this.onMessage = opts.onMessage;
        this.app = new App({
            token: token,
            appToken: appToken,
            socketMode: true,
        });

        this.app.message(async ({ message }) => {
            const msg = message as any;
            // Filter for regular user messages (not bots, and not subtypes like channel_join)
            if (msg.type === 'message' && !msg.subtype && !msg.bot_id) {
                const text = msg.text;
                const channelId = msg.channel;
                const sender = msg.user || 'unknown';
                if (text) {
                    this.onMessage(this.name, channelId, text, sender);
                }
            }
        });

        this.app.error(async (error) => {
            console.error('[Slack] App error:', error);
        });
    }

    async connect(): Promise<void> {
        console.log('[Slack] Connecting via Socket Mode...');
        try {
            await this.app.start();
            console.log('[Slack] Connected successfully');
        } catch (err) {
            console.error('[Slack] Failed to connect:', err);
            throw err;
        }
    }

    protected async doSendMessage(chatId: string, content: string): Promise<string | undefined> {
        const res = await this.app.client.chat.postMessage({
            channel: chatId,
            text: content,
        });
        return res.ts;
    }

    async disconnect(): Promise<void> {
        try {
            await this.app.stop();
            console.log('[Slack] Disconnected');
        } catch (err) {
            console.error('[Slack] Error during disconnect:', err);
        }
    }
}

registerChannel('slack', (opts) => {
    const token = process.env.SLACK_BOT_TOKEN;
    const appToken = process.env.SLACK_APP_TOKEN;
    if (!token || !appToken) return null;
    return new SlackChannel(token, appToken, opts);
});
