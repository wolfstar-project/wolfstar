import { ModerationActions, getAction } from '#lib/moderation/actions';
import { getTypeColor, isValidType } from '#lib/moderation/common/constants';
import { ModerationManagerEntry } from '#lib/moderation/managers/ModerationManagerEntry';
import { fromModerationRow, toModerationRow, type ModerationRecord } from '#lib/moderation/managers/ModerationRecord';
import { applyModerationBuilder } from '#lib/moderation/structures/ModerationCommand';
import { listOverview } from '#lib/structures/commands/moderationCase';
import { Colors } from '#utils/constants';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import { guild } from '#mocks/MockInstances';
import { SlashCommandBuilder } from '@discordjs/builders';
import { container } from '@wolfstar/http-framework';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import { ApplicationCommandOptionType } from 'discord-api-types/v10';

const record: ModerationRecord = {
	id: 12,
	createdAt: 1_700_000_000_000,
	duration: null,
	guildId: guild.id,
	moderatorId: '266624760782258186',
	userId: '266624760782258187',
	reason: 'Was told to keep the voice chat clean.',
	type: TypeVariation.Note,
	metadata: TypeMetadata.None
};

function createEntry(type: TypeVariation) {
	return ModerationManagerEntry.from(guild, { ...record, type });
}

describe('note', () => {
	beforeAll(() => container.i18n.init());

	describe('action', () => {
		test('GIVEN the note action THEN it is not a punishment', () => {
			const action = ModerationActions.note;

			expect(getAction(TypeVariation.Note)).toBe(action);
			expect(action.type).toBe(TypeVariation.Note);
			expect(action.isUndoActionAvailable).toBe(false);
			expect(action.durationRequired).toBe(false);
			expect(action.isDirectMessageAvailable).toBe(false);
		});

		test('GIVEN the action to be told to the user WHEN a note is added THEN no direct message is sent', async () => {
			const entry = createEntry(TypeVariation.Note);
			const fetchUser = vi.spyOn(entry, 'fetchUser');

			// `sendDirectMessage` is protected, `apply` calls it with the `dm` the command resolved:
			await (ModerationActions.note as any).sendDirectMessage(guild, entry, { sendDirectMessage: true });

			expect(fetchUser).not.toHaveBeenCalled();
		});

		test('GIVEN a warning WHEN it is told to the user THEN the direct message is still sent', async () => {
			const entry = createEntry(TypeVariation.Warning);
			const fetchUser = vi.spyOn(entry, 'fetchUser').mockRejectedValue(new Error('reached'));

			await expect((ModerationActions.warning as any).sendDirectMessage(guild, entry, { sendDirectMessage: true })).rejects.toThrow('reached');
			expect(fetchUser).toHaveBeenCalledOnce();
		});
	});

	describe('storage', () => {
		test('GIVEN a note THEN it is a valid type with its own color', () => {
			expect(isValidType(TypeVariation.Note)).toBe(true);
			expect(isValidType(TypeVariation.Note, TypeMetadata.Undo)).toBe(false);
			expect(getTypeColor(createEntry(TypeVariation.Note))).toBe(Colors.BlueGrey);
		});

		test('GIVEN a note THEN it survives the round trip to a row and is not stored as a warning', () => {
			const row = toModerationRow(record);
			const decoded = fromModerationRow(row);

			expect(row.action).not.toBe('AddWarning');
			expect(row.action).not.toBe('RemoveWarning');
			expect(decoded.type).toBe(TypeVariation.Note);
			expect(decoded.metadata).toBe(TypeMetadata.None);
			expect(decoded.duration).toBeNull();
		});
	});

	describe('builder', () => {
		test('GIVEN the note command THEN it has the user, the reason and the message and cannot notify the user', () => {
			const builder = applyModerationBuilder(new SlashCommandBuilder(), { root: 'commands/moderation:note', type: TypeVariation.Note });
			const options = builder.toJSON().options ?? [];

			expect(options.map((option) => option.name)).toEqual(['user', 'reason', 'message']);
			expect(options.map((option) => option.type)).toEqual([
				ApplicationCommandOptionType.User,
				ApplicationCommandOptionType.String,
				ApplicationCommandOptionType.String
			]);
		});

		test('GIVEN the kick command THEN it keeps the dm and authored options', () => {
			const builder = applyModerationBuilder(new SlashCommandBuilder(), { root: 'commands/moderation:kick', type: TypeVariation.Kick });

			expect((builder.toJSON().options ?? []).map((option) => option.name)).toEqual(['user', 'reason', 'message', 'dm', 'authored']);
		});
	});

	describe('overview', () => {
		function footer(entries: ModerationManagerEntry[]) {
			const t = container.i18n.getT('en-US') as TFunction<AnyNamespace>;
			return listOverview(t, entries, null).toJSON().footer!.text;
		}

		test('GIVEN a member with notes THEN they count as no warning, mute, kick or ban', () => {
			expect(footer([createEntry(TypeVariation.Note), createEntry(TypeVariation.Note)])).toBe(footer([]));
		});

		test('GIVEN a member with a warning THEN the warning still counts', () => {
			expect(footer([createEntry(TypeVariation.Warning)])).not.toBe(footer([]));
		});
	});
});
