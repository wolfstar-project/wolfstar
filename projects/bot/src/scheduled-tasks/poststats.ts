import { fetchApproximateUserCount } from '#lib/structures/AnalyticsData';
import { Events } from '#lib/types';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';
import { blueBright, green, red } from 'colorette';
import { setTimeout as sleep } from 'node:timers/promises';

const header = blueBright('[POST STATS   ]');

/**
 * How long a run waits for the gateway to be ready, and how often it looks.
 */
const ReadyTimeout = 30_000;
const ReadyInterval = 500;

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
		super(context, { pattern: '*/10 * * * *' });
	}

	public override async run() {
		const { logger, gatewayClient } = this.container;

		// A run that was due while the bot was down starts with the process, before the gateway is ready. It waits for it,
		// and is skipped when the gateway does not come up: the next run is ten minutes away, and nothing was lost.
		if (!(await this.waitForReady())) {
			logger.debug(`${header} Skipped, the gateway is not ready.`);
			return null;
		}

		const rawGuilds = await gatewayClient.guilds.cache.getSize();
		const rawUsers = await fetchApproximateUserCount();

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

	private async waitForReady() {
		const { gatewayClient } = this.container;
		const deadline = Date.now() + ReadyTimeout;
		while (!gatewayClient.isClientReady()) {
			if (Date.now() >= deadline) return false;
			await sleep(ReadyInterval);
		}

		return true;
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
