import { authenticated, canManage, ratelimit } from '#lib/api/utils';
import { seconds } from '#utils/common';
import { HttpCodes, Route } from '@sapphire/plugin-api';

export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(10), 5, true)
	public async run(request: Route.Request, response: Route.Response) {
		const guildId = request.params.guild;

		const guild = this.container.client.guilds.cache.get(guildId);
		if (!guild) return response.error(HttpCodes.BadRequest);

		const member = await guild.members.fetch(request.auth!.id).catch(() => null);
		if (!member) return response.error(HttpCodes.BadRequest);

		if (!(await canManage(guild, member))) return response.error(HttpCodes.Forbidden);

		const parsedLimit = Number.parseInt(request.query.limit as string, 10);
		const limit = Math.min(Math.max(Number.isNaN(parsedLimit) ? 10 : parsedLimit, 1), 100);
		const offset = Math.max(Number.parseInt(request.query.offset as string, 10) || 0, 0);
		const userId = typeof request.query.userId === 'string' && request.query.userId ? request.query.userId : undefined;
		const commandName = typeof request.query.commandName === 'string' && request.query.commandName ? request.query.commandName : undefined;
		const rawSuccess = request.query.success as string | undefined;
		const success = rawSuccess === 'true' ? true : rawSuccess === 'false' ? false : undefined;

		const where = {
			guildId,
			...(userId !== undefined && { userId }),
			...(commandName !== undefined && { commandName }),
			...(success !== undefined && { success })
		};

		const [rows, total] = await Promise.all([
			this.container.prisma.commandLog.findMany({
				where,
				orderBy: { executedAt: 'desc' },
				take: limit,
				skip: offset
			}),
			this.container.prisma.commandLog.count({ where })
		]);

		return response.status(HttpCodes.OK).json({
			entries: rows.map((row) => ({
				id: row.id,
				guildId: row.guildId,
				userId: row.userId,
				commandName: row.commandName,
				commandType: row.commandType,
				commandId: row.commandId,
				subcommand: row.subcommand,
				channelId: row.channelId,
				success: row.success,
				errorReason: row.errorReason,
				executedAt: row.executedAt.toISOString(),
				latencyMs: row.latencyMs,
				metadata: row.metadata as Record<string, unknown> | null
			})),
			total
		});
	}
}
