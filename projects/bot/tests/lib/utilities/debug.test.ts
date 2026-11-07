import { describeDispatch, describeMessage } from '#utils/debug';
import { GatewayDispatchEvents } from 'discord-api-types/v10';

describe('describeDispatch', () => {
	const message = {
		t: GatewayDispatchEvents.MessageCreate,
		d: { id: '1', guild_id: '2', channel_id: '3', author: { id: '4', username: 'wolf' }, content: 'free nitro at example.com' }
	} as never;

	test('GIVEN a message THEN it tells the event and every ID', () => {
		expect(describeDispatch(message)).toBe('MESSAGE_CREATE id=1 guild=2 channel=3 user=4');
	});

	test('GIVEN a message THEN nothing of what it says reaches the log', () => {
		expect(describeDispatch(message)).not.toContain('nitro');
		expect(describeDispatch(message)).not.toContain('wolf');
	});

	test('GIVEN a member THEN its user is the ID of the user it holds', () => {
		const member = { t: GatewayDispatchEvents.GuildMemberAdd, d: { guild_id: '2', user: { id: '4' } } } as never;
		expect(describeDispatch(member)).toBe('GUILD_MEMBER_ADD guild=2 user=4');
	});

	test('GIVEN a reaction THEN its user is the ID it carries', () => {
		const reaction = { t: GatewayDispatchEvents.MessageReactionAdd, d: { user_id: '4', channel_id: '3' } } as never;
		expect(describeDispatch(reaction)).toBe('MESSAGE_REACTION_ADD channel=3 user=4');
	});

	test('GIVEN IDs that are null or a dispatch with no data THEN only the event is told', () => {
		expect(describeDispatch({ t: GatewayDispatchEvents.MessageCreate, d: { guild_id: null } } as never)).toBe('MESSAGE_CREATE');
		expect(describeDispatch({ t: GatewayDispatchEvents.Resumed, d: null } as never)).toBe('RESUMED');
	});
});

describe('describeMessage', () => {
	test('GIVEN a message THEN it is told by its IDs', () => {
		const message = { id: '1', channelId: '3', guildId: '2', author: { id: '4' }, content: 'free nitro' } as never;
		expect(describeMessage(message)).toBe('message 1 of 4 in 3 of 2');
	});
});
