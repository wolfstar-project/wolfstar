import { parseTimestamp } from 'wolfstar-database';
import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, canManage, ratelimit } from '#lib/api/utils';
import { seconds } from '#common';
import { HttpCodes, Route } from '@wolfstar/plugin-api';

/**
 * Parses a snowflake of the query string into the `bigint` the ID columns hold, `null` when it is not one.
 * @param value The value of the query parameter.
 */
function parseSnowflake(value: string): bigint | null {
	return /^\d{1,20}$/.test(value) ? BigInt(value) : null;
}

export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(10), 5, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const guildId = request.params.guild;

		const guild = await this.container.gatewayClient.guilds.resolve(guildId);
		if (!guild) return response.error(HttpCodes.BadRequest);

		const member = await this.container.gatewayClient.members.fetch(guildId, request.auth!.id).catch(() => null);
		if (!member) return response.error(HttpCodes.BadRequest);

		if (!(await canManage(guild, member))) return response.error(HttpCodes.Forbidden);

		const parsedLimit = Number.parseInt(request.query.limit as string, 10);
		const limit = Math.min(Math.max(Number.isNaN(parsedLimit) ? 10 : parsedLimit, 1), 100);
		const offset = Math.max(Number.parseInt(request.query.offset as string, 10) || 0, 0);
		const userId = typeof request.query.userId === 'string' && request.query.userId ? request.query.userId : undefined;
		const commandName = typeof request.query.commandName === 'string' && request.query.commandName ? request.query.commandName : undefined;
		const rawSuccess = request.query.success as string | undefined;
		const success = rawSuccess === 'true' ? true : rawSuccess === 'false' ? false : undefined;

		// The user ID is a `bigint` column, so a value that is not a snowflake cannot match any row:
		const parsedUserId = userId === undefined ? undefined : parseSnowflake(userId);
		if (parsedUserId === null) return response.status(HttpCodes.OK).json({ entries: [], total: 0 });

		const where = {
			guildId: BigInt(guild.id),
			...(parsedUserId !== undefined && { userId: parsedUserId }),
			...(commandName !== undefined && { commandName }),
			...(success !== undefined && { success })
		};

		const collection = this.container.prisma.orm.public.CommandLog.where(where);
		const [rows, { total }] = await Promise.all([
			collection
				.orderBy((log) => log.executedAt.desc())
				.limit(limit)
				.offset(offset)
				.all(),
			collection.aggregate((aggregate) => ({ total: aggregate.count() }))
		]);

		return response.status(HttpCodes.OK).json({
			entries: rows.map((row) => ({
				id: row.id,
				guildId: row.guildId.toString(),
				userId: row.userId.toString(),
				commandName: row.commandName,
				commandType: row.commandType,
				commandId: row.commandId?.toString() ?? null,
				subcommand: row.subcommand,
				channelId: row.channelId?.toString() ?? null,
				success: row.success,
				errorReason: row.errorReason,
				executedAt: new Date(parseTimestamp(row.executedAt)).toISOString(),
				latencyMs: row.latencyMs,
				metadata: row.metadata as Record<string, unknown> | null
			})),
			total
		});
	}
}
