import { getRestoredStickyRoles } from '#lib/roles/sticky';

const settings = {
	modulesRoles: true,
	rolesMuted: '1',
	rolesRestrictedReaction: '2',
	rolesRestrictedEmbed: '3',
	rolesRestrictedEmoji: null,
	rolesRestrictedAttachment: null,
	rolesRestrictedVoice: '4'
};

describe('getRestoredStickyRoles', () => {
	test('GIVEN the roles module turned on THEN every sticky role is given back', () => {
		expect(getRestoredStickyRoles(settings, ['10', '2', '11'])).toEqual(['10', '2', '11']);
	});

	test('GIVEN the roles module turned off THEN only the roles of a restriction are given back', () => {
		expect(getRestoredStickyRoles({ ...settings, modulesRoles: false }, ['10', '2', '11', '4'])).toEqual(['2', '4']);
	});

	test('GIVEN the roles module turned off and no role of a restriction THEN none is given back', () => {
		expect(getRestoredStickyRoles({ ...settings, modulesRoles: false }, ['10', '11'])).toEqual([]);
	});
});
