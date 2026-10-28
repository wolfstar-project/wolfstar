import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, canManage, ratelimit } from '#lib/api/utils';
import { serializeSettings, writeSettingsTransaction, type SchemaDataKey } from '#lib/database';
import { validateSettingsChanges } from '#lib/database/settings/validation';
import { createTranslator } from '#lib/structures/commands/utils';
import { seconds } from 'wolfstar-shared';
import { HttpCodes, Route, type MimeType } from '@wolfstar/plugin-api';
import type { GuildDataValue, ReadonlyGuildData } from 'wolfstar-database';

export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(1), 2, true)
	public async run(request: ApiAuthRequest, response: Route.Response) {
		const requestBody = (await request.readBodyJson()) as { guild_id: string; data: [SchemaDataKey, GuildDataValue][] | undefined };

		if (!requestBody.guild_id || !Array.isArray(requestBody.data) || requestBody.guild_id !== request.params.guild) {
			return response.status(HttpCodes.BadRequest).json(['Invalid body.']);
		}

		const guild = await this.container.gatewayClient.guilds.resolve(requestBody.guild_id);
		if (!guild) return response.status(HttpCodes.BadRequest).json(['Guild not found.']);

		const member = await this.container.gatewayClient.members.fetch(guild.id, request.auth!.id).catch(() => null);
		if (!member) return response.status(HttpCodes.BadRequest).json(['Member not found.']);

		if (!(await canManage(guild, member))) return response.error(HttpCodes.Forbidden);

		try {
			using trx = await writeSettingsTransaction(guild);
			const t = createTranslator(this.container.i18n.getT(trx.settings.language));
			// Each value is checked on the settings as they end up, see `validateSettingsChanges`:
			const data = await validateSettingsChanges(trx.settings, requestBody.data, t);

			await trx.write(Object.fromEntries(data)).submitWithAudit(request.auth!.id);

			return this.sendSettings(response, trx.settings);
		} catch (errors) {
			return response.status(HttpCodes.BadRequest).json(errors);
		}
	}

	private sendSettings(response: Route.Response, settings: ReadonlyGuildData) {
		return response
			.status(HttpCodes.OK)
			.setContentType('application/json' satisfies MimeType)
			.end(serializeSettings(settings));
	}
}
