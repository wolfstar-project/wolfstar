import type { ISchemaValue } from '#lib/database/settings/base/ISchemaValue';
import type { SchemaGroup } from '#lib/database/settings/schema/SchemaGroup';
import type { Serializer } from '#lib/database/settings/structures/Serializer';
import type { GuildDataKey, ReadonlyGuildData } from 'wolfstar-database';
import type { Translator } from '#lib/structures/commands/utils';
import type { TypedT } from '#lib/types';
import { resolveGuild } from '#common';
import { isNullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';

/**
 * The kinds of value a key accepts, each the name or an alias of the serializer piece that reads and displays it.
 */
export type SchemaKeyType =
	| 'boolean'
	| 'categoryOrTextChannel'
	| 'guildTextChannel'
	| 'guildVoiceChannel'
	| 'guildCategoryChannel'
	| 'command'
	| 'commandMatch'
	| 'emoji'
	| 'guild'
	| 'invite'
	| 'language'
	| 'messageUpdateStyle'
	| 'notAllowed'
	| 'number'
	| 'integer'
	| 'float'
	| 'permissionNode'
	| 'reactionRole'
	| 'role'
	| 'snowflake'
	| 'stickyRole'
	| 'string'
	| 'timespan'
	| 'uniqueRoleSet'
	| 'url'
	| 'user';

export class SchemaKey<K extends GuildDataKey = GuildDataKey> implements ISchemaValue {
	/**
	 * The key that identifies this configuration key from the parent group.
	 */
	public readonly key: string;

	/**
	 * The i18n key for the configuration key.
	 */
	public readonly description: TypedT<string>;

	/**
	 * The maximum value for the configuration key.
	 */
	public readonly maximum: number | null;

	/**
	 * The minimum value for the configuration key.
	 */
	public readonly minimum: number | null;

	/**
	 * Whether or not the range checks are inclusive.
	 */
	public readonly inclusive: boolean;

	/**
	 * The visible name of the configuration key.
	 */
	public readonly name: string;

	/**
	 * The property from the Prisma entity.
	 */
	public readonly property: K;

	/**
	 * The type of the value this property accepts.
	 */
	public readonly type: SchemaKeyType;

	/**
	 * Whether or not this accepts multiple values.
	 */
	public readonly array: boolean;

	/**
	 * The default value for this key.
	 */
	public readonly default: unknown;

	/**
	 * Whether this key should only be configurable on the dashboard
	 */
	public readonly dashboardOnly: boolean;

	/**
	 * The parent group that holds this key.
	 */
	public parent: SchemaGroup | null = null;

	public constructor(options: ConfigurableKeyValueOptions) {
		this.key = options.key;
		this.description = options.description;
		this.maximum = options.maximum;
		this.minimum = options.minimum;
		this.inclusive = options.inclusive ?? false;
		this.name = options.name;
		this.property = options.property as K;
		this.type = options.type;
		this.array = options.array;
		this.default = options.default;
		this.dashboardOnly = options.dashboardOnly ?? false;
	}

	public get serializer(): Serializer<ReadonlyGuildData[K]> {
		const value = container.stores.get('serializers').get(this.type);
		if (typeof value === 'undefined') throw new Error(`The serializer for '${this.type}' does not exist.`);
		return value as Serializer<ReadonlyGuildData[K]>;
	}

	/**
	 * Parses the text a user wrote into a value of this key.
	 * @throws The translated reason the text is not a valid value.
	 */
	public async parse(settings: ReadonlyGuildData, t: Translator, input: string): Promise<ReadonlyGuildData[K]> {
		const { serializer } = this;
		const context = await this.getContext(settings, t);

		const result = await serializer.parse(input, context);
		return result.match({
			ok: (value) => value,
			err: (error) => {
				throw error.message;
			}
		});
	}

	public async stringify(settings: ReadonlyGuildData, t: Translator, value: ReadonlyGuildData[K]): Promise<string> {
		const { serializer } = this;
		const context = await this.getContext(settings, t);
		return serializer.stringify(value, context);
	}

	public async display(settings: ReadonlyGuildData, t: Translator): Promise<string> {
		const { serializer } = this;
		const context = await this.getContext(settings, t);

		if (this.array) {
			const values = settings[this.property] as readonly any[];
			return isNullish(values) || values.length === 0
				? 'None'
				: `[ ${(await Promise.all(values.map((value) => serializer.stringify(value, context)))).join(' | ')} ]`;
		}

		const value = settings[this.property];
		return isNullish(value) ? t('commands/conf:settingNotSet') : serializer.stringify(value, context);
	}

	public async getContext(settings: ReadonlyGuildData, t: Translator): Promise<Serializer.UpdateContext> {
		return {
			entity: settings,
			guild: await resolveGuild(settings.id),
			t,
			entry: this
		} satisfies Serializer.UpdateContext;
	}
}

export type ConfigurableKeyValueOptions = Pick<
	SchemaKey,
	'key' | 'description' | 'maximum' | 'minimum' | 'inclusive' | 'name' | 'property' | 'type' | 'array' | 'default' | 'dashboardOnly'
>;
