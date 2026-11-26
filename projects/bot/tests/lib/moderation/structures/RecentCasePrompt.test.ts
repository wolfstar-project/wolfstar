import { ModerationManagerEntry } from '#lib/moderation/managers/ModerationManagerEntry';
import { decodeRecentCaseId, encodeRecentCaseId, findRecentCase, renderRecentCasePrompt } from '#lib/moderation/structures/RecentCasePrompt';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import { guild } from '#mocks/MockInstances';
import { ButtonStyle, MessageFlags } from 'discord-api-types/v10';

describe('RecentCasePrompt', () => {
	const now = Date.UTC(2026, 9, 16, 12);
	const entry = (id: number, minutesAgo: number, archived = false) => ({
		id,
		createdAt: now - minutesAgo * 60_000,
		isArchived: () => archived
	});

	describe('findRecentCase', () => {
		test('GIVEN a case within the minutes THEN the latest one is found', () => {
			expect(findRecentCase([entry(1, 3), entry(2, 1)], 5, now)?.id).toBe(2);
		});

		test('GIVEN only older cases THEN none is found', () => {
			expect(findRecentCase([entry(1, 10)], 5, now)).toBeNull();
		});

		test('GIVEN an archived case THEN it is not one', () => {
			expect(findRecentCase([entry(1, 1, true)], 5, now)).toBeNull();
		});

		test('GIVEN the setting at 0 THEN it never asks', () => {
			expect(findRecentCase([entry(1, 0)], 0, now)).toBeNull();
		});
	});

	describe('custom IDs', () => {
		const ownerId = '266624760782258186';
		const promptId = '1291234567890123456';

		test('GIVEN an action THEN its custom ID is read back', () => {
			const id = encodeRecentCaseId({ ownerId, verb: 'confirm', promptId });

			expect(id.startsWith('moderationConfirm.')).toBe(true);
			expect(decodeRecentCaseId(id.split('.').slice(1))).toEqual({ ownerId, verb: 'confirm', promptId });
		});

		test('GIVEN something else THEN it decodes to null', () => {
			expect(decodeRecentCaseId(null)).toBeNull();
			expect(decodeRecentCaseId([ownerId, `delete:${promptId}`])).toBeNull();
			expect(decodeRecentCaseId([ownerId, 'confirm:abc'])).toBeNull();
			expect(decodeRecentCaseId([ownerId, 'confirm'])).toBeNull();
		});
	});
});

describe('renderRecentCasePrompt', () => {
	const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)) as never;
	const action = { ownerId: '266624760782258186', promptId: '1575577244007399424' };

	test('GIVEN a recent mute THEN it asks in one container whether to go on, with a red button and a cancel', () => {
		const entry = ModerationManagerEntry.from(guild, {
			id: 4,
			createdAt: 1_700_000_000_000,
			duration: null,
			guildId: guild.id,
			moderatorId: action.ownerId,
			userId: '266624760782258187',
			reason: null,
			type: TypeVariation.Mute,
			metadata: TypeMetadata.None
		});
		const message = renderRecentCasePrompt(t, action, entry);
		const [container] = message.components;
		const [text, row] = container.components as unknown as [{ content: string }, { components: { custom_id: string; style: ButtonStyle }[] }];

		expect(message.flags).toBe(MessageFlags.IsComponentsV2);
		expect(text.content).toContain('moderationActions:recentVerb.mute');
		expect(text.content).toContain('<t:1700000000:R>');
		expect(row.components.map((button) => [decodeRecentCaseId(button.custom_id.split('.').slice(1))?.verb, button.style])).toEqual([
			['confirm', ButtonStyle.Danger],
			['cancel', ButtonStyle.Secondary]
		]);
	});
});
