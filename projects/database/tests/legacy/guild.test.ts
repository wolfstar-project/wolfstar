import { convertLegacyGuild, NotCarriedColumns } from '../../src/legacy/guild.js';
import { LegacyValueError, type LegacyRow } from '../../src/legacy/types.js';
import contract from '../../src/generated/prisma/contract.json' with { type: 'json' };
import legacyColumns from './guilds-columns.json' with { type: 'json' };
import { createLegacyGuild } from './fixtures.js';

const Guild = '254360814063058944';
const Channel = '254360814063058945';
const Other = '254360814063058946';

function storageColumns(table: string) {
	const { table: tables } = contract.storage.namespaces.public.entries as unknown as Record<
		string,
		Record<string, { columns: Record<string, unknown> }>
	>;
	return Object.keys(tables[table].columns);
}

describe('convertLegacyGuild', () => {
	test('GIVEN every column of the legacy table THEN each is read or listed as not carried', () => {
		const read = new Set<string>();
		const row = new Proxy(createLegacyGuild({ 'selfmod.attachments.enabled': true }), {
			get(target, key: string) {
				read.add(key);
				return target[key];
			}
		});
		convertLegacyGuild(row);

		expect(legacyColumns.filter((column) => !read.has(column) && !NotCarriedColumns.includes(column as never))).toEqual([]);
		expect(NotCarriedColumns.filter((column) => !legacyColumns.includes(column))).toEqual([]);
	});

	test('GIVEN any guild THEN every row only names columns the contract has', () => {
		const { warnings, ...tables } = convertLegacyGuild(
			createLegacyGuild({
				'selfmod.attachments.enabled': true,
				'no-mention-spam.enabled': true,
				'sticky-roles': [{ user: Other, roles: [Channel] }]
			})
		);
		expect(warnings).toEqual([]);

		for (const [table, rows] of Object.entries(tables)) {
			for (const row of rows) expect(storageColumns(table)).toEqual(expect.arrayContaining(Object.keys(row)));
		}
	});

	test('GIVEN settings that only change name THEN they reach their column', () => {
		const rows = convertLegacyGuild(
			createLegacyGuild({
				language: 'it',
				'channels.updates': Channel,
				'channels.logs.member-add': Channel,
				'channels.logs.reaction': Other,
				'channels.logs.moderation': Channel,
				'events.timeout': true,
				'events.twemoji-reactions': true,
				'disabled-commands': ['ban'],
				'disabled-channels': [Channel],
				'roles.initial-bots': Other
			})
		);

		expect(rows.Guild[0]).toMatchObject({ id: Guild, language: 'it', updates_channel_id: Channel });
		expect(rows.GuildLogs[0]).toMatchObject({ member_add: Channel, reaction_emoji_add: Other, reaction_emoji_include_twemoji: true });
		expect(rows.GuildModeration[0]).toMatchObject({ channel_id: Channel, track_timeouts: true });
		expect(rows.GuildCommands[0]).toMatchObject({ disabled: ['ban'], disabled_channels: [Channel] });
		expect(rows.GuildRoles[0]).toMatchObject({ initial_robots: [Other] });
	});

	test('GIVEN one ban event on THEN the bans are tracked', () => {
		expect(convertLegacyGuild(createLegacyGuild({ 'events.ban-remove': true })).GuildModeration[0]).toMatchObject({ track_bans: true });
		expect(convertLegacyGuild(createLegacyGuild()).GuildModeration[0]).toMatchObject({ track_bans: false });
	});

	test('GIVEN the channels ignored by the edits and the deletions THEN only the ones both ignore stay, so no log goes silent', () => {
		const rows = convertLegacyGuild(
			createLegacyGuild({ 'channels.ignore.message-edit': [Channel, Other], 'channels.ignore.message-delete': [Channel] })
		);
		expect(rows.GuildLogs[0]).toMatchObject({ ignore_messages: [Channel] });
	});

	test('GIVEN the moderation settings THEN they keep their values', () => {
		const rows = convertLegacyGuild(
			createLegacyGuild({
				'messages.moderation-dm': true,
				'messages.moderation-message-display': false,
				'messages.moderator-name-display': false
			})
		);
		expect(rows.GuildModeration[0]).toMatchObject({
			direct_message: true,
			display_reason: true,
			display_message: false,
			display_moderator: false
		});
	});

	test('GIVEN the commands disabled by channel THEN they are written as they are', () => {
		const entries = [{ channel: Channel, commands: ['ban'] }];
		expect(convertLegacyGuild(createLegacyGuild({ 'disabled-commands-channels': entries })).GuildCommands[0]).toMatchObject({
			disabled_in_channels: entries
		});
	});

	test('GIVEN sticky roles THEN each member gets a row, and one with no role none', () => {
		const rows = convertLegacyGuild(
			createLegacyGuild({
				'sticky-roles': [
					{ user: Other, roles: [Channel] },
					{ user: Channel, roles: [] }
				]
			})
		);
		expect(rows.StickyRole).toEqual([{ user_id: Other, guild_id: Guild, role_ids: [Channel] }]);
	});

	test('GIVEN a single initial role THEN it is a list of one', () => {
		expect(convertLegacyGuild(createLegacyGuild({ 'roles.initial': Channel })).GuildRoles[0]).toMatchObject({ initial: [Channel] });
		expect(convertLegacyGuild(createLegacyGuild()).GuildRoles[0]).toMatchObject({ initial: [] });
	});

	test('GIVEN the permission nodes THEN they are written as they are', () => {
		const users = [{ id: Other, allow: ['ban'], deny: [] }];
		expect(convertLegacyGuild(createLegacyGuild({ 'permissions.users': users })).GuildPermissions[0]).toMatchObject({ users, roles: [] });
	});

	test('GIVEN a snowflake that is not one THEN it fails', () => {
		const row: LegacyRow = createLegacyGuild({ 'channels.logs.prune': 'nope' });
		expect(() => convertLegacyGuild(row)).toThrow(LegacyValueError);
	});
});
