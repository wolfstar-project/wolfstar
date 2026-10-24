// Registers `container.i18n` on the client, the Stars CLI injects this import in `src/main.ts`:
import '@wolfstar/plugin-i18next/register';

import { Command, container } from '@wolfstar/http-framework';
import { Attachment, CollectionCache, Embed, GatewayClient } from '@wolfstar/plugin-gateway';
import type { Cache, Guild, GuildMember, Message, RawAPIType, Role, StructureMixin, User } from '@wolfstar/plugin-gateway';
import {
	ChannelType,
	GuildFeature,
	GuildMemberFlags,
	GuildNSFWLevel,
	GuildSystemChannelFlags,
	Locale,
	MessageFlags,
	RoleFlags,
	type APIAttachment,
	type APIEmbed,
	type APIGuild,
	type APIGuildMember,
	type APIMessage,
	type APIRole,
	type APITextChannel,
	type APIUser
} from 'discord-api-types/v10';
import { fileURLToPath } from 'node:url';

/**
 * The client the tests run against: a real `GatewayClient` that is never started, so it has no shard, no HTTP server
 * and no Redis. Its caches are the in-memory ones, filled by the `create*` functions below, and it registers
 * `container.gatewayClient`, `container.client`, `container.rest` and `container.i18n` (call `container.i18n.init()`
 * to load the locales of `src/locales`).
 */
export const client = new GatewayClient({
	discordToken: 'test-token',
	discordPublicKey: '0'.repeat(64),
	intents: 0,
	i18n: {
		defaultLanguageDirectory: fileURLToPath(new URL('../../src/locales', import.meta.url)),
		defaultName: 'en-US',
		defaultNS: 'globals',
		// The formatter of `globals:humanDateTimeValue`, as the original bot configures it. `createClient()` does not
		// register the formatters yet, so this is the only one the tests have:
		formatters: [
			{
				name: 'humanDateTime',
				format: (lng, options) => {
					const formatter = new Intl.DateTimeFormat(lng, { timeZone: 'Etc/UTC', dateStyle: 'short', timeStyle: 'medium', ...options });
					return (value) => formatter.format(value);
				},
				cached: true
			}
		]
	}
});

// The tests cannot reach Discord: what is not in the cache must be mocked by the test that needs it.
client.rest.request = (options) =>
	Promise.reject(new Error(`The tests cannot use the Discord API (${options.method} ${options.fullRoute}): mock the manager method instead.`));

/**
 * Unwraps what a cache answers. The managers type their caches as possibly asynchronous, which the Redis caches the bot
 * runs with are, but the in-memory ones of the tests answer synchronously.
 */
function sync<Value>(value: Value | Promise<Value>): Value {
	if (value instanceof Promise) throw new TypeError('The client of the tests must use the in-memory caches.');
	return value;
}

/**
 * Gets the cache of a manager as what it is in the tests, a `CollectionCache`: a synchronous `Map` of structures.
 */
export function getCache<Value extends StructureMixin<object>, Raw extends RawAPIType<Value>>(manager: {
	cache: Cache<Value, Raw>;
}): CollectionCache<Value, Raw> {
	const { cache } = manager;
	if (cache instanceof CollectionCache) return cache;
	throw new TypeError('The client of the tests must use the in-memory caches.');
}

export function createEmbed(data: APIEmbed) {
	return new Embed(data);
}

export function createAttachment(data: APIAttachment) {
	return new Attachment(data);
}

export const userData: APIUser = {
	id: '266624760782258186',
	username: 'Skyra',
	discriminator: '7023',
	avatar: '09b52e547fa797c47c7877cd10eb6ba8',
	global_name: null
};

export function createUser(data: Partial<APIUser> = {}): User {
	return sync(client.users.cache.add({ ...userData, ...data }));
}

export const guildMemberData: APIGuildMember = {
	user: userData,
	deaf: false,
	mute: false,
	nick: null,
	roles: [],
	premium_since: null,
	joined_at: '2019-02-03T21:57:10.354Z',
	flags: GuildMemberFlags.DidRejoin
};

export function createGuildMember(data: Partial<APIGuildMember> = {}, g: Guild = guild): GuildMember {
	return sync(client.members.cache.add({ ...guildMemberData, ...data, user: { ...guildMemberData.user, ...data.user }, guild_id: g.id }));
}

export const roleData: APIRole = {
	id: '254360814063058944',
	name: '@​everyone',
	color: 0,
	colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
	hoist: false,
	position: 0,
	permissions: '104189505',
	managed: false,
	mentionable: false,
	flags: RoleFlags.InPrompt
};

export function createRole(data: Partial<APIRole> = {}, g: Guild = guild): Role {
	return sync(client.roles.cache.add({ ...roleData, ...data, guild_id: g.id }));
}

export const guildData: APIGuild = {
	id: '254360814063058944',
	name: 'Skyra Lounge',
	icon: 'a_933397e7006838cf97fe70e47605b274',
	description: null,
	discovery_splash: null,
	afk_channel_id: null,
	afk_timeout: 60,
	application_id: null,
	banner: null,
	default_message_notifications: 1,
	emojis: [],
	explicit_content_filter: 2,
	features: [
		GuildFeature.News,
		GuildFeature.AnimatedIcon,
		GuildFeature.Discoverable,
		GuildFeature.WelcomeScreenEnabled,
		GuildFeature.InviteSplash,
		GuildFeature.Community
	],
	max_members: 100000,
	max_presences: null,
	max_video_channel_users: 25,
	mfa_level: 1,
	nsfw_level: GuildNSFWLevel.Default,
	owner_id: '242043489611808769',
	preferred_locale: Locale.EnglishUS,
	premium_subscription_count: 3,
	premium_progress_bar_enabled: false,
	premium_tier: 1,
	public_updates_channel_id: '700806874294911067',
	region: 'eu-central',
	roles: [roleData],
	rules_channel_id: '409663610780909569',
	splash: null,
	hub_type: null,
	stickers: [],
	safety_alerts_channel_id: null,
	system_channel_flags: GuildSystemChannelFlags.SuppressJoinNotifications,
	system_channel_id: '254360814063058944',
	vanity_url_code: null,
	verification_level: 2,
	widget_channel_id: '409663610780909569',
	widget_enabled: true,
	incidents_data: null
};

/**
 * Creates a guild and caches it with its roles, the way a `GUILD_CREATE` dispatch does.
 */
export function createGuild(data: Partial<APIGuild> = {}): Guild {
	const { emojis: _emojis, roles, stickers: _stickers, ...raw } = { ...guildData, ...data };
	const g = sync(client.guilds.cache.add(raw));
	for (const role of roles) sync(client.roles.cache.add({ ...role, guild_id: g.id }));
	return g;
}
export const guild = createGuild();

export const textChannelData: APITextChannel = {
	type: ChannelType.GuildText,
	id: '331027040306331648',
	name: 'staff-testing',
	position: 19,
	parent_id: '355963113696133130',
	permission_overwrites: [],
	topic: null,
	last_message_id: '825133477896388670',
	rate_limit_per_user: 0,
	last_pin_timestamp: '2021-01-17T08:17:36.935Z',
	guild_id: '254360814063058944',
	nsfw: false
};

export function createTextChannel(data: Partial<APITextChannel> = {}, g: Guild = guild) {
	return sync(client.channels.cache.add({ ...textChannelData, ...data, guild_id: g.id }));
}
export const textChannel = createTextChannel();

export const messageData: APIMessage = {
	id: '825134485813067796',
	type: 0,
	content: '',
	channel_id: textChannelData.id,
	author: {
		id: '266624760782258186',
		username: 'Skyra',
		avatar: '51227d2976cc66b9c1add6b911eda5e9',
		discriminator: '7023',
		public_flags: 65536,
		bot: true,
		global_name: null
	},
	attachments: [],
	embeds: [],
	mentions: [],
	mention_roles: [],
	pinned: false,
	mention_everyone: false,
	tts: false,
	timestamp: '2021-03-26T22:29:51.675000+00:00',
	edited_timestamp: '2021-03-26T22:29:56.581000+00:00',
	flags: MessageFlags.Ephemeral
};

/**
 * Creates a message of a guild and caches it, the way a `MESSAGE_CREATE` dispatch does.
 */
export function createMessage(data: Partial<APIMessage> = {}, g: Guild = guild): Message {
	return sync(client.messages.cache.add({ ...messageData, ...data, guild_id: g.id, mentions: [] }));
}

export const commands = container.stores.get('commands');

class MockCommand extends Command {}

/**
 * Creates a command and adds it to the `commands` store, as if it was loaded from `commands/<directories>/<name>.ts`.
 * The directories are its category and its sub-category.
 */
export function createCommand(name: string, ...directories: string[]): Command {
	const root = '/virtual/commands';
	const command = new MockCommand({ name, path: [root, ...directories, `${name}.ts`].join('/'), root, store: commands }, {});
	commands.set(command.name, command);
	return command;
}
