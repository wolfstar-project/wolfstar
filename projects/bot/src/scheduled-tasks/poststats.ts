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
 * Posts, every ten minutes, how many servers the bot is in to the bot lists it has a token for, and to the analytics.
 *
 * @remarks
 *
 * The counts are the approximate ones Discord keeps for the application, there is no local cache of every guild to
 * count. The bot lists are only posted to in production.
 */
export class UserTask extends ScheduledTask<'poststats'> {
	public constructor(context: ScheduledTask.LoaderContext) {
		super(context, { pattern: '*/10 * * * *' });
	}

	public override async run() {
		const { logger, gatewayClient } = this.container;

		const application = await gatewayClient.api.applications.getCurrent();
		const rawGuilds = application.approximate_guild_count ?? 0;
		const rawUsers = application.approximate_user_install_count ?? 0;

		this.container.client.emit(Events.AnalyticsSync, rawGuilds, rawUsers);
		if (process.env.NODE_ENV !== 'production') return;

		const clientId = application.id;
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
	}

	private async query(url: string, body: string, token: string | null | undefined, list: Lists) {
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
