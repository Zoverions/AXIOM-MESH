import { Telegraf } from 'telegraf';
import { ChannelOpts, ReliabilityPolicy, registerChannel } from './registry';
import { BaseChannel } from './base';

export class TelegramChannel extends BaseChannel {
    name = 'telegram';
    reliabilityPolicy: ReliabilityPolicy = {
        maxRetries: 3,
        retryDelayMs: 2000,
        rateLimitMs: 1000, // typical telegram bot rate limit ~30 msgs/sec
        enforceDeliveryReceipt: true,
        classifyRateLimitError: (err: unknown) => /429|retry after|too many requests/i.test(String((err as any)?.message || err))
    };
    private bot: Telegraf;
    private onMessage: (channelName: string, chatId: string, content: string, sender: string) => void;

    constructor(token: string, opts: ChannelOpts) {
        super();
        this.bot = new Telegraf(token);
        this.onMessage = opts.onMessage;

        this.bot.on('text', (ctx) => {
            const chatId = ctx.chat.id.toString();
            const text = ctx.message.text;
            const sender = ctx.from.username || ctx.from.first_name || ctx.from.id.toString();
            this.onMessage(this.name, chatId, text, sender);
        });

        // Error handling for the bot
        this.bot.catch((err: any, ctx: any) => {
            console.error(`[Telegram] Error for ${ctx.updateType}:`, err);
        });
    }

    async connect(): Promise<void> {
        console.log('[Telegram] Connecting...');
        try {
            await this.bot.launch();
            const botInfo = await this.bot.telegram.getMe();
            console.log(`[Telegram] Connected successfully as @${botInfo.username}`);
        } catch (err) {
            console.error('[Telegram] Failed to connect:', err);
            throw err;
        }
    }

    protected async doSendMessage(chatId: string, content: string): Promise<string | undefined> {
        const msg = await this.bot.telegram.sendMessage(chatId, content);
        return msg.message_id.toString();
    }

    async disconnect(): Promise<void> {
        this.bot.stop('SIGINT');
        console.log('[Telegram] Disconnected');
    }
}

registerChannel('telegram', (opts) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    return new TelegramChannel(token, opts);
});
