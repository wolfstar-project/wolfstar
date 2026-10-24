import { decodeAutoMessageModalId, encodeAutoMessageModalId } from '#lib/automessages/ids';
import { getAutoMessageAllowedMentions, shouldSendAutoMessage } from '#lib/automessages/send';

/** What the framework hands an interaction handler for a custom ID: the parts after its name. */
function parse(customId: string): unknown {
	return customId.split('.').slice(1);
}

describe('automatic message modal IDs', () => {
	it('reads back what the command was given', () => {
		const action = { ownerId: '242043489611808769', channelId: '1254567891234567890', interval: 7 * 24 * 60 * 60_000, mentions: true };
		const customId = encodeAutoMessageModalId(action);

		expect(customId.length).toBeLessThanOrEqual(100);
		expect(decodeAutoMessageModalId(parse(customId))).toEqual(action);
	});

	it.each(['enable:abc:600:0', 'enable:1254567891234567890:600:2', 'delete:1254567891234567890:600:0'])('refuses %s', (action) => {
		expect(decodeAutoMessageModalId(parse(`automessage.242043489611808769.${action}`))).toBeNull();
	});
});

describe('shouldSendAutoMessage', () => {
	it('sends the first message', () => {
		expect(shouldSendAutoMessage('1254567891234567890', null)).toBe(true);
	});

	it('sends again when somebody wrote after it', () => {
		expect(shouldSendAutoMessage('1254567891234567899', '1254567891234567890')).toBe(true);
	});

	it('skips a channel whose last message is still the one it sent', () => {
		expect(shouldSendAutoMessage('1254567891234567890', '1254567891234567890')).toBe(false);
	});

	it('sends in a channel whose messages were all deleted', () => {
		expect(shouldSendAutoMessage(null, '1254567891234567890')).toBe(true);
	});
});

describe('getAutoMessageAllowedMentions', () => {
	it('pings nobody unless asked', () => {
		expect(getAutoMessageAllowedMentions(false)).toEqual({ parse: [] });
	});

	it('pings who the message mentions when asked', () => {
		expect(getAutoMessageAllowedMentions(true).parse).toEqual(expect.arrayContaining(['users', 'roles', 'everyone']));
	});
});
