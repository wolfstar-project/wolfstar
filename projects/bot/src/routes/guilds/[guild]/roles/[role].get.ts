import { flattenRole } from '#lib/api/ApiTransformers';
import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, canManage, ratelimit } from '#lib/api/utils';
import { seconds } from '#common';
import { HttpCodes, Route } from '@wolfstar/plugin-api';

export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(5), 2, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const guildId = request.params.guild;

		const guild = await this.container.gatewayClient.guilds.resolve(guildId);
		if (!guild) return response.error(HttpCodes.BadRequest);

		const member = await this.container.gatewayClient.members.fetch(guildId, request.auth!.id).catch(() => null);
		if (!member) return response.error(HttpCodes.BadRequest);

		if (!(await canManage(guild, member))) return response.error(HttpCodes.Forbidden);

		const roleId = request.params.role;
		const { roles } = this.container.gatewayClient;
		const role =
			(await roles.cache.get(roles.resolveKey(guildId, roleId))) ??
			(await roles.fetchAll(guildId).catch(() => [])).find((role) => role.id === roleId);
		return role ? response.json(flattenRole(role)) : response.error(HttpCodes.NotFound);
	}
}
