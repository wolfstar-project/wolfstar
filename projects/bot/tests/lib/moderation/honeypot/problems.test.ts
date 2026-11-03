import { BigRoleMinimumMembers, findHoneypotProblems, renderHoneypotProblems, type HoneypotProblemInput } from '#lib/moderation/honeypot/problems';
import type { TFunction } from '@wolfstar/plugin-i18next';
import { PermissionFlagsBits } from 'discord-api-types/v10';

describe('the problems of a honeypot', () => {
	const fine: HoneypotProblemInput = {
		everyonePermissions: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.AttachFiles,
		botCanAct: true,
		botPosition: 10,
		memberCount: 1000,
		roles: [
			{ id: '1', position: 12, members: 5 },
			{ id: '2', position: 3, members: 900 }
		]
	};

	test('GIVEN a honeypot that is set up right THEN there is no problem', () => {
		expect(findHoneypotProblems(fine)).toEqual([]);
	});

	test('GIVEN @everyone kept out of the channel THEN the first thing that keeps them out is told', () => {
		expect(findHoneypotProblems({ ...fine, everyonePermissions: 0n })).toEqual(['everyoneCannotView']);
		expect(findHoneypotProblems({ ...fine, everyonePermissions: PermissionFlagsBits.ViewChannel })).toEqual(['everyoneCannotSend']);
		expect(findHoneypotProblems({ ...fine, everyonePermissions: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages })).toEqual([
			'everyoneCannotAttach'
		]);
		expect(findHoneypotProblems({ ...fine, everyonePermissions: PermissionFlagsBits.Administrator })).toEqual([]);
	});

	test('GIVEN a bot that cannot act THEN it is told', () => {
		expect(findHoneypotProblems({ ...fine, botCanAct: false })).toEqual(['botCannotAct']);
	});

	test('GIVEN a role most members hold above the bot THEN it is told, in a guild big enough', () => {
		const big = { ...fine, roles: [{ id: '2', position: 11, members: 900 }] };

		expect(findHoneypotProblems(big)).toEqual(['bigRoleAboveBot']);
		expect(findHoneypotProblems({ ...big, memberCount: BigRoleMinimumMembers - 1 })).toEqual([]);
		expect(findHoneypotProblems({ ...big, memberCount: null })).toEqual([]);
		expect(findHoneypotProblems({ ...big, roles: [{ id: '2', position: 11, members: 600 }] })).toEqual([]);
	});

	test('GIVEN problems THEN each is a line under a title, and none is nothing', () => {
		const t = ((key: string) => key) as unknown as TFunction;

		expect(renderHoneypotProblems(t, [])).toEqual([]);
		expect(renderHoneypotProblems(t, ['everyoneCannotAttach', 'botCannotAct'])).toEqual([
			'commands/honeypot:problemsTitle',
			'- commands/honeypot:problemEveryoneCannotAttach',
			'- commands/honeypot:problemBotCannotAct'
		]);
	});
});
