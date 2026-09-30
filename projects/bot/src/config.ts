import { type ClientOptions } from '@wolfstar/plugin-gateway';

export const OWNERS: string[] = ['242043489611808769'];

export const CLIENT_OPTIONS: ClientOptions = {
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
};
