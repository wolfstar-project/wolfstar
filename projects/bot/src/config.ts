import { GatewayIntentBits, type ClientOptions } from 'discord.js';

export const OWNERS: string[] = ['242043489611808769'];

export const CLIENT_OPTIONS: ClientOptions = {
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
};
