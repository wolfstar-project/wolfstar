import { authenticated, canManage, ratelimit } from '#lib/api/utils';
import { seconds } from '#utils/common';
import { container } from '@sapphire/framework';
import { HttpCodes, Route } from '@sapphire/plugin-api';

export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(10), 5, true)
	public async run(request: Route.Request, response: Route.Response) {
		const guildId = request.params.guild;

		const guild = container.client.guilds.cache.get(guildId);
		if (!guild) return response.error(HttpCodes.BadRequest);

		const member = await guild.members.fetch(request.auth!.id).catch(() => null);
		if (!member) return response.error(HttpCodes.BadRequest);

		if (!(await canManage(guild, member))) return response.error(HttpCodes.Forbidden);

		const take = Math.min(Number(request.query.take) || 50, 100);
		const skip = Math.max(Number(request.query.skip) || 0, 0);

		const [results, total] = await Promise.all([
			container.prisma.auditLog.findMany({
				where: { guildId },
				orderBy: { createdAt: 'desc' },
				take,
				skip
			}),
			container.prisma.auditLog.count({
				where: { guildId }
			})
		]);

		return response.status(HttpCodes.OK).json({ entries: results, total });
	}
}
