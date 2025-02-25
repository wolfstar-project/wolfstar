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
import { getT } from '#lib/i18n';
import { seconds } from '#utils/common';
import { cast } from '#utils/util';
import { HttpCodes, Route, type MimeType } from '@sapphire/plugin-api';
import type { Guild } from 'discord.js';

export class UserRoute extends Route {
	@authenticated()
	@ratelimit(seconds(1), 2, true)
	public async run(request: Route.Request, response: Route.Response) {
		const requestBody = (await request.readBodyJson()) as { guild_id: string; data: [SchemaDataKey, GuildDataValue][] | undefined };

		if (!requestBody.guild_id || !Array.isArray(requestBody.data) || requestBody.guild_id !== request.params.guild) {
			return response.status(HttpCodes.BadRequest).json(['Invalid body.']);
		}

		const guild = this.container.client.guilds.cache.get(requestBody.guild_id);
		if (!guild) return response.status(HttpCodes.BadRequest).json(['Guild not found.']);

		const member = await guild.members.fetch(request.auth!.id).catch(() => null);
		if (!member) return response.status(HttpCodes.BadRequest).json(['Member not found.']);

		if (!(await canManage(guild, member))) return response.error(HttpCodes.Forbidden);

		const entries = requestBody.data;
		try {
			using trx = await writeSettingsTransaction(guild);
			const data = await this.validateAll(trx.settings, guild, entries);
			await trx.write(Object.fromEntries(data)).submit();

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

	private async validate(key: SchemaDataKey, value: unknown, context: PartialSerializerUpdateContext) {
		const entry = getConfigurableKeys().get(key);
		if (!entry || !isSchemaKey(entry)) throw `${key}: The key ${key} does not exist in the current schema.`;
		try {
			// If null is passed, reset to default:
			if (value === null) return [entry.property, entry.default];

			const ctx = { ...context, entry } as Serializer.UpdateContext;
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

	private async validateAll(entity: ReadonlyGuildData, guild: Guild, pairs: readonly [SchemaDataKey, GuildDataValue][]) {
		const context: PartialSerializerUpdateContext = {
			entity,
			guild,
			t: getT(entity.language)
		};

		const errors: string[] = [];
		const promises = pairs.map((pair) => {
			if (!Array.isArray(pair) || pair.length !== 2) {
				errors.push('Invalid input error.');
				return null;
			}

			return this.validate(pair[0], pair[1], context).catch((error) => errors.push(error));
		});

		const results = await Promise.all(promises);
		if (errors.length === 0) return cast<readonly [SchemaDataKey, GuildDataValue][]>(results);

		throw errors;
	}
}

type PartialSerializerUpdateContext = Omit<Serializer.UpdateContext, 'entry'>;
