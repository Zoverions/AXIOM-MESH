import { Telegraf } from 'telegraf';
import { Channel, ChannelOpts, registerChannel } from './registry';

export class TelegramChannel implements Channel {
    name = 'telegram';
    private bot: Telegraf;
    private onMessage: (channelName: string, chatId: string, content: string, sender: string) => void;

    constructor(token: string, opts: ChannelOpts) {
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

    async sendMessage(chatId: string, content: string): Promise<void> {
        try {
            await this.bot.telegram.sendMessage(chatId, content);
            console.log(`[Telegram] Message sent to ${chatId}`);
        } catch (err) {
            console.error(`[Telegram] Failed to send message to ${chatId}:`, err);
        }
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
