import { convertGuildCommandRules } from '#lib/structures/commands-menu/convertGuild';
import { isWorker } from '#utils/worker';
import { envParseBoolean } from '@wolfstar/env-utilities';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import { fetchGuildIdsWithPermissionNodes } from 'wolfstar-database';

/**
 * Converts the legacy permission nodes of every guild into command rules once the client is ready, on the bot that
 * sets `COMMAND_RULES_CONVERT_NODES` (the alpha one), by one process: the only one, or with the sharder its first shard.
 * The guilds are converted one after the other; one that fails is logged and the next one goes on. Running it again
 * changes nothing, see `convertGuildCommandRules`.
 */
@RegisterAsGatewayListener('clientReady', { once: true })
export class UserListener extends EventGatewayListener<'clientReady'> {
	public async run() {
		if (!envParseBoolean('COMMAND_RULES_CONVERT_NODES', false)) return;

		const shard = this.container.shard ?? null;
		if (isWorker() || (shard !== null && shard.id !== 0)) return;

		const { logger, prisma } = this.container;
		const actorId = this.container.gatewayClient.user!.id;
		const guildIds = await fetchGuildIdsWithPermissionNodes(prisma.orm);

		let converted = 0;
		for (const guildId of guildIds) {
			try {
				const result = await convertGuildCommandRules(guildId, actorId);
				if (result === null) continue;

				converted++;
				logger.info(
					`[COMMAND RULES] ${guildId}: ${result.converted.allow} allowed and ${result.converted.deny} ignored entries converted, ${result.skipped.length} nodes left`
				);
			} catch (error) {
				logger.error(`[COMMAND RULES] ${guildId}: the conversion failed`, error);
			}
		}

		logger.info(`[COMMAND RULES] ${converted} of ${guildIds.length} guilds converted`);
	}
}
