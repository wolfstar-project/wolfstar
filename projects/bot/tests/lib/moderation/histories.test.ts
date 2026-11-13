import { MaximumHistoryMessages, renderMessageHistory, selectHistoryMessages } from '#lib/moderation/histories';

describe('message histories', () => {
	const now = Date.UTC(2026, 9, 16, 12);
	const day = 86_400_000;
	const message = (id: string, author: string, daysAgo: number, attachments: string[] = []) => ({
		id,
		channelId: 'c1',
		content: `message ${id}`,
		createdTimestamp: now - daysAgo * day,
		author: { id: author },
		attachments: attachments.map((url) => ({ url }))
	});

	describe('selectHistoryMessages', () => {
		test('GIVEN messages of several authors THEN only the ones of the member within 14 days are kept, newest first', () => {
			const selected = selectHistoryMessages(
				[message('1', 'a', 2), message('2', 'b', 1), message('3', 'a', 1), message('4', 'a', 20)],
				'a',
				now
			);

			expect(selected.map((entry) => entry.id)).toEqual(['3', '1']);
		});

		test('GIVEN attachments THEN their links are kept', () => {
			expect(selectHistoryMessages([message('1', 'a', 0, ['https://cdn/x.png'])], 'a', now)[0].attachments).toEqual(['https://cdn/x.png']);
		});

		test('GIVEN too many messages THEN the newest ones are kept', () => {
			const many = Array.from({ length: MaximumHistoryMessages + 10 }, (_, index) => message(String(index), 'a', index / 100));

			expect(selectHistoryMessages(many, 'a', now)).toHaveLength(MaximumHistoryMessages);
		});
	});

	test('GIVEN a history THEN its file lists the messages oldest first, with their channel', () => {
		const text = renderMessageHistory(
			{
				id: '7',
				guildId: 'g',
				userId: 'a',
				moderatorId: 'm',
				caseId: 3,
				createdAt: now,
				expiresAt: now + day,
				messages: [
					{ id: '2', channelId: 'c1', content: 'second', createdAt: now - 1000, attachments: [] },
					{ id: '1', channelId: 'c1', content: 'first', createdAt: now - 2000, attachments: ['https://cdn/x.png'] }
				]
			},
			() => 'general'
		);

		expect(text).toContain('for the case 3');
		expect(text.indexOf('first')).toBeLessThan(text.indexOf('second'));
		expect(text).toContain('#general: first [https://cdn/x.png]');
	});
});
