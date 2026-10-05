import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, canManage, ratelimit } from '#lib/api/utils';
import { readSettings, serializeSettings } from '#lib/database';
import { seconds } from '#common';
import { HttpCodes, Route, type MimeType } from '@wolfstar/plugin-api';
import type { ReadonlyGuildData } from 'wolfstar-database';

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

		const settings = await readSettings(guild);
		return this.sendSettings(response, settings);
	}

	private sendSettings(response: Route.Response, settings: ReadonlyGuildData) {
		return response
			.status(HttpCodes.OK)
			.setContentType('application/json' satisfies MimeType)
			.end(serializeSettings(settings));
	}
}
