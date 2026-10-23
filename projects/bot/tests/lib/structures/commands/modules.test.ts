import { isCommandOfDisabledModule, ModerationModuleCommands } from '#lib/structures/commands/modules';

describe('isCommandOfDisabledModule', () => {
	test('GIVEN the moderation module turned off THEN its commands are denied', () => {
		expect(isCommandOfDisabledModule({ modulesModeration: false }, 'ban')).toBe(true);
		expect(isCommandOfDisabledModule({ modulesModeration: false }, 'case')).toBe(true);
	});

	test('GIVEN the moderation module turned on THEN its commands are allowed', () => {
		expect(isCommandOfDisabledModule({ modulesModeration: true }, 'ban')).toBe(false);
	});

	test.each(['report', 'reports', 'permissions', 'reasons', 'warn-thresholds', 'settings'])(
		'GIVEN the moderation module turned off THEN %s, which is not one of its commands, is allowed',
		(name) => {
			expect(isCommandOfDisabledModule({ modulesModeration: false }, name)).toBe(false);
		}
	);

	test('GIVEN the commands of the module THEN they are the moderation ones', () => {
		// A new moderation command has to be looked at: this list is what the module turns off.
		expect([...ModerationModuleCommands]).toEqual([
			'archive',
			'ban',
			'case',
			'dehoist',
			'kick',
			'lockdown',
			'mute',
			'note',
			'prune',
			'restrict',
			'role',
			'setnickname',
			'slowmode',
			'softban',
			'timeout',
			'unrestrict',
			'vmute',
			'voicekick',
			'warn'
		]);
	});
});
