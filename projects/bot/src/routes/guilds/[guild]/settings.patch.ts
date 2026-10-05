import type { ApiAuthRequest } from '#lib/api/Auth';
import { authenticated, canManage, ratelimit } from '#lib/api/utils';
import {
	getConfigurableKeys,
	isSchemaKey,
	serializeSettings,
	writeSettingsTransaction,
	type GuildDataValue,
	type ReadonlyGuildData,
	type SchemaDataKey,
	type Serializer
} from '#lib/database';
import { createTranslator, type Translator } from '#lib/structures/commands/utils';
import { seconds } from '#common';
import { cast } from '#utils/util';
import { HttpCodes, Route, type MimeType } from '@wolfstar/plugin-api';

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

		const entries = requestBody.data;
		try {
			using trx = await writeSettingsTransaction(guild);
			const data = await this.validateAll(trx.settings, entries);
			const settingsData = Object.fromEntries(data);

			await trx.write(settingsData).submitWithAudit(request.auth!.id);

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

	private async validate(key: SchemaDataKey, value: unknown, settings: ReadonlyGuildData, t: Translator) {
		const entry = getConfigurableKeys().get(key);
		if (!entry || !isSchemaKey(entry)) throw `${key}: The key ${key} does not exist in the current schema.`;
		try {
			// If null is passed, reset to default:
			if (value === null) return [entry.property, entry.default];

			const ctx = await entry.getContext(settings, t);
			const result = await (entry.array ? this.validateArray(value, ctx) : entry.serializer.isValid(value as any, ctx));
			if (!result) throw 'The value is not valid.';

			return [entry.property, value] as const;
		} catch (error) {
			if (error instanceof Error) throw `${key}: ${error.message}`;
			throw `${key}: ${error}`;
		}
	}

	private async validateArray(value: any, ctx: Serializer.UpdateContext) {
		if (!Array.isArray(value)) throw new Error('Expected an array.');

		const { serializer } = ctx.entry;
		return Promise.all(value.map((value) => serializer.isValid(value, ctx)));
	}

	private async validateAll(entity: ReadonlyGuildData, pairs: readonly [SchemaDataKey, GuildDataValue][]) {
		const t = createTranslator(this.container.i18n.getT(entity.language));

		const errors: string[] = [];
		const promises = pairs.map((pair) => {
			if (!Array.isArray(pair) || pair.length !== 2) {
				errors.push('Invalid input error.');
				return null;
			}

			return this.validate(pair[0], pair[1], entity, t).catch((error) => errors.push(error));
		});

		const results = await Promise.all(promises);
		if (errors.length === 0) return cast<readonly [SchemaDataKey, GuildDataValue][]>(results);

		throw errors;
	}
}
