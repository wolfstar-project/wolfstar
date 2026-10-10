import { flattenMember } from '#lib/api/ApiTransformers';
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

		const memberAuthor = await this.container.gatewayClient.members.fetch(guildId, request.auth!.id).catch(() => null);
		if (!memberAuthor) return response.error(HttpCodes.BadRequest);
		if (!(await canManage(guild, memberAuthor))) return response.error(HttpCodes.Forbidden);

		const memberId = request.params.member;
		const member = await this.container.gatewayClient.members.fetch(guildId, memberId).catch(() => null);
		return member ? response.json(await flattenMember(member)) : response.error(HttpCodes.NotFound);
	}
}
