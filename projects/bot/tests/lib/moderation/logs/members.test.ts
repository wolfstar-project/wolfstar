import { renderMemberEvent } from '#lib/moderation/logs/members';
import { getHandler } from '#lib/i18n/structures/Handler';
import { userData } from '#mocks/MockInstances';
import { container } from '@wolfstar/http-framework';
import { i18next, type AnyNamespace, type TFunction } from '@wolfstar/plugin-i18next';

const occurredAt = Date.UTC(2026, 10, 4, 15, 24);
const joinedAt = occurredAt - 60_000;
// `fetchGuildT` gives the listeners the function typed for every namespace, as this one is:
const t = i18next.getFixedT('en-US') as unknown as TFunction<AnyNamespace>;

beforeAll(async () => {
	await container.i18n.init();
	i18next.services.formatter!.add('duration', (value) => getHandler('en-US').duration.format(value));
});

describe('member event logs', () => {
	test.each([
		['left', 'Member Left'],
		['kicked', 'Member Kicked'],
		['banned', 'Member Banned'],
		['softbanned', 'Member Softbanned']
	] as const)('shows %s as the main event, with the user and ID separately', (type, title) => {
		const embed = renderMemberEvent(t, userData, 0, { type, joinedAt, roles: '<@&123>' }, occurredAt).toJSON();
		expect(embed.author?.name).toBe(title);
		expect(embed.description).toContain(`<@${userData.id}>`);
		expect(embed.description).not.toContain('joined this server');
		expect(embed.footer?.text).toBe(`ID: ${userData.id}`);
		expect(embed.fields).toContainEqual({ name: 'Roles', value: '<@&123>' });
	});

	test('keeps time in server fixed at departure even when the log is rendered later', () => {
		vi.useFakeTimers();
		vi.setSystemTime(occurredAt + 5 * 60 * 60_000);
		try {
			const embed = renderMemberEvent(t, userData, 0, { type: 'banned', joinedAt, roles: null }, occurredAt).toJSON();
			expect(embed.timestamp).toBe(new Date(occurredAt).toISOString());
			expect(embed.fields).toContainEqual({ name: 'Joined Server', value: `<t:${joinedAt / 1000}:f>`, inline: true });
			expect(embed.fields).toContainEqual({ name: 'Time in Server', value: '1 minute', inline: true });
		} finally {
			vi.useRealTimers();
		}
	});

	test.each([null, Number.NaN, -1, occurredAt + 1])('does not invent membership dates when joinedAt is %s', (joinedAt) => {
		const embed = renderMemberEvent(t, userData, 0, { type: 'left', joinedAt, roles: null }, occurredAt).toJSON();
		expect(embed.author?.name).toBe('Member Left');
		expect(embed.fields ?? []).toEqual([]);
	});

	test.each(['joined', 'mutedJoined'] as const)('shows account age separately from joining the server for %s', (type) => {
		const embed = renderMemberEvent(t, userData, 0, { type, createdAt: occurredAt - 86_400_000 }, occurredAt).toJSON();
		expect(embed.author?.name).toBe(type === 'joined' ? 'Member Joined' : 'Muted Member Joined');
		expect(embed.fields).toContainEqual({ name: 'Account Age', value: '1 day', inline: true });
		expect(embed.fields?.find((field) => field.name === 'Account Created')?.value).toBe(`<t:${(occurredAt - 86_400_000) / 1000}:f>`);
	});
});
