import { Client, GatewayIntentBits } from 'discord.js';
import { Channel, ChannelOpts, registerChannel } from './registry';

export class DiscordChannel implements Channel {
    name = 'discord';
    private client: Client;
    private opts: ChannelOpts;

    constructor(private botToken: string, opts: ChannelOpts) {
        this.opts = opts;
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ]
        });

        this.client.on('messageCreate', (message) => {
            if (message.author.bot) return;

            // Route standard discord messages
            this.opts.onMessage(this.name, message.channelId, message.content, message.author.id);
        });
    }

    async connect(): Promise<void> {
        console.log(`Connecting to Discord...`);
        try {
            await this.client.login(this.botToken);
            console.log(`Discord logged in as ${this.client.user?.tag}`);
        } catch (error) {
            console.error('Failed to connect to Discord:', error);
        }
    }

    async sendMessage(chatId: string, text: string): Promise<void> {
        try {
            const channel = await this.client.channels.fetch(chatId);
            if (channel?.isTextBased() && 'send' in channel) {
                await channel.send(text);
            }
        } catch (error) {
            console.error('Failed to send Discord message:', error);
        }
    }

    async disconnect(): Promise<void> {
        this.client.destroy();
    }
}

registerChannel('discord', (opts: ChannelOpts) => {
    const token = process.env.DISCORD_TOKEN;
    if (!token) return null;
    return new DiscordChannel(token, opts);
});
