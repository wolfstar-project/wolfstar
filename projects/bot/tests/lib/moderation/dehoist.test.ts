import { DehoistedNickname, getDehoistChange, type MemberNames } from '#lib/moderation/dehoist';

const names = (shown: string, rest: Partial<MemberNames> = {}): MemberNames => ({ nickname: null, globalName: shown, username: 'username', ...rest });

describe('getDehoistChange', () => {
	it.each(['wolfstar', 'Wolf Star', '0day', 'José', 'Niccolò', '_underscore', '[TAG] name'])('leaves %s alone', (name) => {
		expect(getDehoistChange(names(name))).toBeNull();
	});

	it.each([
		['!!wolfstar', 'wolfstar'],
		['  wolfstar', 'wolfstar'],
		['.-*wolf star', 'wolf star'],
		['/(wolfstar)', 'wolfstar)']
	])('takes what hoists %s away', (name, expected) => {
		expect(getDehoistChange(names(name))).toEqual({ nick: expected });
	});

	it.each([
		['𝖂𝖔𝖑𝖋𝖘𝖙𝖆𝖗', 'Wolfstar'],
		['ｗｏｌｆ', 'wolf'],
		['Ẅ̸̢o̵l̷f̴', 'Wolf'],
		['Ⓦⓞⓛⓕ', 'Wolf'],
		['Иван', 'Ivan'],
		['wolf ✨', 'wolf'],
		['!!𝖂𝖔𝖑𝖋', 'Wolf']
	])('turns the strange characters of %s into plain text', (name, expected) => {
		expect(getDehoistChange(names(name))).toEqual({ nick: expected });
	});

	it('reads the nickname before the display name', () => {
		expect(getDehoistChange(names('!!!display', { nickname: 'nickname' }))).toBeNull();
		expect(getDehoistChange(names('display', { nickname: '!!nickname' }))).toEqual({ nick: 'nickname' });
	});

	it('removes a nickname that is nothing but strange characters when the display name is clean', () => {
		expect(getDehoistChange(names('display', { nickname: '!!😀' }))).toEqual({ nick: null });
	});

	it('takes the username for a display name that is nothing but strange characters', () => {
		expect(getDehoistChange(names('!!!', { username: '.wolfstar' }))).toEqual({ nick: 'wolfstar' });
	});

	it('falls back to a fixed nickname when no name can be cleaned', () => {
		expect(getDehoistChange(names('!!!', { username: '..' }))).toEqual({ nick: DehoistedNickname });
	});

	it('cuts the nickname to the length Discord takes', () => {
		expect(getDehoistChange(names(`!${'a'.repeat(40)}`))).toEqual({ nick: 'a'.repeat(32) });
	});
});
