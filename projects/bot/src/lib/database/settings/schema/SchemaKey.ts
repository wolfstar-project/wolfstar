import type { ISchemaValue } from '#lib/database/settings/base/ISchemaValue';
import type { SchemaGroup } from '#lib/database/settings/schema/SchemaGroup';
import type { GuildDataKey } from '#lib/database/settings/types';
import type { TypedT } from '#lib/types';

/**
 * The kinds of value a key accepts, which tell how it is displayed and edited (see `lib/structures/settings-menu`).
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
	| 'user'
	| 'word';

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
}

export type ConfigurableKeyValueOptions = Pick<
	SchemaKey,
	'key' | 'description' | 'maximum' | 'minimum' | 'inclusive' | 'name' | 'property' | 'type' | 'array' | 'default' | 'dashboardOnly'
>;
