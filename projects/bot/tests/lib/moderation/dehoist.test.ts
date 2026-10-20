import { DehoistedNickname, getDehoistedNickname } from '#lib/moderation/dehoist';

describe('getDehoistedNickname', () => {
	it.each(['wolfstar', 'Wolf Star', '0day', 'émile', '_underscore'])('leaves %s alone', (name) => {
		expect(getDehoistedNickname(name, 'username')).toBeNull();
	});

	it.each([
		['!!wolfstar', 'wolfstar'],
		['  wolfstar', 'wolfstar'],
		['.-*wolf star', 'wolf star'],
		['/(wolfstar)', 'wolfstar)']
	])('takes what hoists %s away', (name, expected) => {
		expect(getDehoistedNickname(name, 'username')).toBe(expected);
	});

	it('takes the username for a name that is nothing but what hoists it', () => {
		expect(getDehoistedNickname('!!!', '.wolfstar')).toBe('wolfstar');
	});

	it('falls back to a fixed nickname when the username is hoisting characters too', () => {
		expect(getDehoistedNickname('!!!', '..')).toBe(DehoistedNickname);
	});

	it('cuts the nickname to the length Discord takes', () => {
		expect(getDehoistedNickname(`!${'a'.repeat(40)}`, 'username')).toBe('a'.repeat(32));
	});
});
