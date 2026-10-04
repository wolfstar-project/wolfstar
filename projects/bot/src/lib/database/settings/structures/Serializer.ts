import type { SchemaKey } from '#lib/database/settings/schema/SchemaKey';
import type { ReadonlyGuildData } from '#lib/database/settings/types';
import type { Translator } from '#lib/structures/commands/utils';
import { Result } from '@sapphire/result';
import type { Awaitable } from '@sapphire/utilities';
import { AliasPiece, container } from '@wolfstar/http-framework';
import type { AnyChannel, Guild, Role } from '@wolfstar/plugin-gateway';

export type SerializerResult<T> = Result<T, Error>;
export type AsyncSerializerResult<T> = Promise<Result<T, Error>>;

/**
 * Reads, validates and displays the values of one type of settings key (see `SchemaKey#type`).
 *
 * @remarks
 *
 * The serializers are the pieces of the `serializers` store, in `src/serializers`. A value is parsed from the text a user
 * wrote, since there are no prefix command arguments to pick from, and validated as it is stored when it comes from
 * somewhere else, like the dashboard.
 */
export abstract class Serializer<T> extends AliasPiece<Serializer.Options, 'serializers'> {
	/**
	 * Resolves the text a user wrote into a value.
	 * @param input The text to parse.
	 * @param context The context for the key.
	 */
	public abstract parse(input: string, context: Serializer.UpdateContext): SerializerResult<T> | AsyncSerializerResult<T>;

	/**
	 * Check whether or not the value is valid.
	 * @param value The value to check.
	 * @param context The context for the key.
	 */
	public abstract isValid(value: T, context: Serializer.UpdateContext): Awaitable<boolean>;

	/**
	 * Formats a value to display it.
	 * @param data The value to format.
	 * @param context The context for the key.
	 */
	public stringify(data: Readonly<T>, _context: Serializer.UpdateContext): Awaitable<string> {
		return String(data);
	}

	/**
	 * Check if two entries are equals.
	 * @param left The left value to check against.
	 * @param right The right value to check against.
	 */
	public equals(left: T, right: T): boolean {
		return left === right;
	}

	/**
	 * Returns a successful result.
	 * @param value The value to return.
	 */
	protected ok<V>(value: V): SerializerResult<V> {
		return Result.ok(value);
	}

	/**
	 * Returns an erroneous result.
	 * @param error The message of the error.
	 */
	protected error(error: string): SerializerResult<T> {
		return Result.err(new Error(error));
	}

	/**
	 * Fetches a role of the guild of the context, `null` when it does not exist.
	 * @param guild The guild the role belongs to.
	 * @param id The ID of the role.
	 */
	protected async fetchRole(guild: Guild, id: string): Promise<Role | null> {
		const { roles } = container.gatewayClient;
		const cached = await roles.cache.get(roles.resolveKey(guild.id, id));
		if (cached) return cached;

		return (await roles.fetchAll(guild.id).catch(() => [])).find((role) => role.id === id) ?? null;
	}

	/**
	 * Finds a role of the guild from a mention, an ID or a name.
	 * @param guild The guild the role belongs to.
	 * @param input The text to resolve.
	 */
	protected async findRole(guild: Guild, input: string): Promise<Role | null> {
		const id = /^(?:<@&)?(\d{17,20})>?$/.exec(input)?.[1];
		if (id) return this.fetchRole(guild, id);

		const name = input.toLowerCase();
		return (await container.gatewayClient.roles.fetchAll(guild.id).catch(() => [])).find((role) => role.name.toLowerCase() === name) ?? null;
	}

	/**
	 * Fetches a channel of the guild of the context, `null` when it does not exist or belongs to another guild.
	 * @param guild The guild the channel belongs to.
	 * @param id The ID of the channel.
	 */
	protected async fetchChannel(guild: Guild, id: string): Promise<AnyChannel | null> {
		const channel = await container.gatewayClient.channels.fetch(id).catch(() => null);
		return channel !== null && 'guildId' in channel && channel.guildId === guild.id ? channel : null;
	}

	/**
	 * Finds a channel of the guild from a mention, an ID or a name.
	 * @param guild The guild the channel belongs to.
	 * @param input The text to resolve.
	 */
	protected async findChannel(guild: Guild, input: string): Promise<AnyChannel | null> {
		const id = /^(?:<#)?(\d{17,20})>?$/.exec(input)?.[1];
		if (id) return this.fetchChannel(guild, id);

		const name = input.replace(/^#/, '').toLowerCase();
		const channels = await guild.channels.fetch().catch(() => []);
		return channels.find((channel) => 'name' in channel && channel.name?.toLowerCase() === name) ?? null;
	}

	/**
	 * Check the boundaries of a key's minimum or maximum.
	 * @param value The value to return when it is in range.
	 * @param length The number to check, the value itself or its length.
	 * @param context The context for the key.
	 */
	protected minOrMax(value: T, length: number, { entry: { minimum, maximum, inclusive, name }, t }: Serializer.UpdateContext): SerializerResult<T> {
		if (minimum !== null && maximum !== null) {
			if ((length >= minimum && length <= maximum && inclusive) || (length > minimum && length < maximum && !inclusive)) {
				return this.ok(value);
			}

			if (minimum === maximum) {
				return this.error(t(inclusive ? 'serializers:minMaxExactlyInclusive' : 'serializers:minMaxExactlyExclusive', { name, min: minimum }));
			}

			return this.error(
				t(inclusive ? 'serializers:minMaxBothInclusive' : 'serializers:minMaxBothExclusive', { name, min: minimum, max: maximum })
			);
		}

		if (minimum !== null) {
			if ((length >= minimum && inclusive) || (length > minimum && !inclusive)) {
				return this.ok(value);
			}

			return this.error(t(inclusive ? 'serializers:minMaxMinInclusive' : 'serializers:minMaxMinExclusive', { name, min: minimum }));
		}

		if (maximum !== null) {
			if ((length <= maximum && inclusive) || (length < maximum && !inclusive)) {
				return this.ok(value);
			}

			return this.error(t(inclusive ? 'serializers:minMaxMaxInclusive' : 'serializers:minMaxMaxExclusive', { name, max: maximum }));
		}

		return this.ok(value);
	}
}

export namespace Serializer {
	export type Options = AliasPiece.Options;
	export type LoaderContext = AliasPiece.LoaderContext<'serializers'>;
	export type UpdateContext = SerializerUpdateContext;
}

export interface SerializerUpdateContext {
	entry: SchemaKey;
	entity: ReadonlyGuildData;
	guild: Guild;
	t: Translator;
}
