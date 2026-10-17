import { fetchFlattenedChannel } from '#lib/api/ApiTransformers';
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

		const channelId = request.params.channel;
		// The channels are cached by ID, whatever their guild, so the channel is checked to belong to this one:
		const channel = await this.container.gatewayClient.channels.fetch(channelId).catch(() => null);
		return channel && 'guildId' in channel && channel.guildId === guildId
			? response.json(await fetchFlattenedChannel(channel))
			: response.error(HttpCodes.NotFound);
	}
}
