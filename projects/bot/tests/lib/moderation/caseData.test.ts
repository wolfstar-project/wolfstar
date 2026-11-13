import { ModerationManagerEntry } from '#lib/moderation/managers/ModerationManagerEntry';
import type { ModerationRecord } from '#lib/moderation/managers/ModerationRecord';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import { guild } from '#mocks/MockInstances';

const record: ModerationRecord = {
	id: 7,
	createdAt: 1_700_000_000_000,
	duration: null,
	guildId: guild.id,
	moderatorId: '266624760782258186',
	userId: '266624760782258187',
	reason: null,
	type: TypeVariation.Mute,
	metadata: TypeMetadata.None
};

describe('ModerationManagerEntry.from', () => {
	test('GIVEN a case that holds nothing besides its row THEN it has no extra data and no message', () => {
		const entry = ModerationManagerEntry.from(guild, record);

		expect(entry.extraData).toBeNull();
		expect(entry.messageReference).toBeNull();
	});

	test('GIVEN what the case holds besides its row THEN the entry gets it back', () => {
		const message = { channelId: '254360814063058945', messageId: '1557124128337829937' };
		const entry = ModerationManagerEntry.from(guild, record, { extraData: ['254360814063058946'], message });

		expect(entry.extraData).toEqual(['254360814063058946']);
		expect(entry.messageReference).toEqual(message);
	});
});
