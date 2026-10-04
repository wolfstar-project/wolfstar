import { Events } from '#lib/types';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';
import { blueBright, green, red } from 'colorette';

const header = blueBright('[POST STATS   ]');

enum Lists {
	BotListSpace = 'botlist.space',
	Discords = 'discords.com',
	DiscordBotList = 'discordbotlist.com',
	TopGG = 'top.gg',
	DiscordBotsGG = 'discord.bots.gg',
	BotsOnDiscord = 'bots.ondiscord.xyz'
}

/**
 * Posts, every ten minutes, how many servers and users the bot has to the bot lists it has a token for, and to the
 * analytics.
 *
 * @remarks
 *
 * The servers are counted in the gateway cache. Their members are not all cached, so the users are the sum of the
 * approximate member counts Discord gives for the guilds of the bot. The bot lists are only posted to in production.
 */
export class UserTask extends ScheduledTask<'poststats'> {
	public constructor(context: ScheduledTask.LoaderContext) {
		// A run that asks to be delayed is tried again 30 seconds later:
		super(context, { pattern: '*/10 * * * *', customJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 30_000 } } });
	}

	public override async run() {
		const { logger, gatewayClient } = this.container;

		// If the websocket isn't ready, delay the execution by 30 seconds:
		if (!gatewayClient.isClientReady()) throw new Error('The gateway client is not ready yet.');

		const rawGuilds = await gatewayClient.guilds.cache.getSize();
		const rawUsers = await this.fetchMemberCount();

		this.processAnalytics(rawGuilds, rawUsers);
		if (process.env.NODE_ENV !== 'production') return null;

		const clientId = gatewayClient.user!.id;
		const guilds = rawGuilds.toString();
		const users = rawUsers.toString();
		const results = (
			await Promise.all([
				this.query(`https://top.gg/api/bots/${clientId}/stats`, `{"server_count":${guilds}}`, process.env.TOP_GG_TOKEN, Lists.TopGG),
				this.query(
					`https://discord.bots.gg/api/v1/bots/${clientId}/stats`,
					`{"guildCount":${guilds}}`,
					process.env.DISCORD_BOTS_TOKEN,
					Lists.DiscordBotsGG
				),
				this.query(
					`https://discords.com/bots/api/bot/${clientId}`,
					`{"server_count":${guilds}}`,
					process.env.BOTS_FOR_DISCORD_TOKEN,
					Lists.Discords
				),
				this.query(
					`https://discordbotlist.com/api/v1/bots/${clientId}/stats`,
					`{"guilds":${guilds},"users":${users}}`,
					process.env.DISCORD_BOT_LIST_TOKEN ? `Bot ${process.env.DISCORD_BOT_LIST_TOKEN}` : null,
					Lists.DiscordBotList
				),
				this.query(
					`https://bots.ondiscord.xyz/bot-api/bots/${clientId}/guilds`,
					`{"guildCount":${guilds}}`,
					process.env.BOTS_ON_DISCORD_TOKEN,
					Lists.BotsOnDiscord
				),
				this.query(
					`https://api.discordlist.space/v1/bots/${clientId}`,
					`{"server_count":${guilds}}`,
					process.env.BOTLIST_SPACE_TOKEN,
					Lists.BotListSpace
				)
			])
		).filter((value) => value !== null);

		if (results.length) logger.trace(`${header} [ ${guilds} [G] ] [ ${users} [U] ] | ${results.join(' | ')}`);
		return null;
	}

	/**
	 * Sums the approximate member counts of every guild the bot is in, 200 guilds at a time.
	 */
	private async fetchMemberCount() {
		const { api } = this.container.gatewayClient;

		let total = 0;
		let after: string | undefined;
		while (true) {
			const guilds = await api.users.getGuilds({ limit: 200, with_counts: true, after });
			for (const guild of guilds) total += guild.approximate_member_count ?? 0;

			if (guilds.length < 200) return total;
			after = guilds.at(-1)!.id;
		}
	}

	private processAnalytics(guilds: number, users: number) {
		this.container.client.emit(Events.AnalyticsSync, guilds, users);
	}

	public async query(url: string, body: string, token: string | null | undefined, list: Lists) {
		if (!token) return null;

		try {
			const response = await fetch(url, { body, headers: { 'content-type': 'application/json', authorization: token }, method: 'POST' });
			return response.ok ? green(list) : `${red(list)} [${red(response.status.toString())}]`;
		} catch {
			return `${red(list)} [${red('network')}]`;
		}
	}
}

declare module '@wolfstar/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		poststats: never;
	}
}
