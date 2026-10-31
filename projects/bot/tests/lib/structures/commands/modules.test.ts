import { getDisabledModuleDenial, ModerationModuleCommands, ReportsModuleCommands } from '#lib/structures/commands/modules';

const modules = (changes: Partial<Parameters<typeof getDisabledModuleDenial>[0]>) => ({ modulesModeration: true, modulesReports: true, ...changes });

describe('getDisabledModuleDenial', () => {
	test('GIVEN the moderation module turned off THEN its commands are denied', () => {
		expect(getDisabledModuleDenial(modules({ modulesModeration: false }), 'ban')).toBe('preconditions:disabledModuleModeration');
		expect(getDisabledModuleDenial(modules({ modulesModeration: false }), 'case')).toBe('preconditions:disabledModuleModeration');
	});

	test('GIVEN the moderation module turned on THEN its commands are allowed', () => {
		expect(getDisabledModuleDenial(modules({}), 'ban')).toBeNull();
	});

	test.each(['report', 'reports', 'permissions', 'reasons', 'warn-thresholds', 'settings'])(
		'GIVEN the moderation module turned off THEN %s, which is not one of its commands, is allowed',
		(name) => {
			expect(getDisabledModuleDenial(modules({ modulesModeration: false }), name)).toBeNull();
		}
	);

	test('GIVEN the reports module turned off THEN /report is denied, and /reports, which looks after the ones already sent, is not', () => {
		expect(getDisabledModuleDenial(modules({ modulesReports: false }), 'report')).toBe('preconditions:disabledModuleReports');
		expect(getDisabledModuleDenial(modules({ modulesReports: false }), 'reports')).toBeNull();
		expect([...ReportsModuleCommands]).toEqual(['report']);
	});

	test('GIVEN the reports module turned on THEN /report is allowed', () => {
		expect(getDisabledModuleDenial(modules({}), 'report')).toBeNull();
	});

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
