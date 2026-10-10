import { findDisabledBy, ProtectedCommands } from '#lib/structures/commands-menu/disabled';
import type { Command } from '@wolfstar/http-framework';

function createCommand(name: string, category: string, subCategory?: string) {
	return { name, location: { directories: subCategory === undefined ? [category] : [category, subCategory] } } as unknown as Command;
}

describe('disabled commands', () => {
	const ban = createCommand('ban', 'Moderation');
	const whois = createCommand('whois', 'Tools');

	test('GIVEN a command that is not listed THEN it is enabled', () => {
		expect(findDisabledBy([], ban)).toBeNull();
		expect(findDisabledBy(['kick', 'Tools.*'], ban)).toBeNull();
	});

	test('GIVEN a command that is listed THEN its name says what disables it', () => {
		expect(findDisabledBy(['kick', 'ban'], ban)).toBe('ban');
		expect(findDisabledBy(['Moderation.ban'], ban)).toBe('Moderation.ban');
	});

	test('GIVEN a category or every command THEN they disable the commands under them', () => {
		expect(findDisabledBy(['Tools.*'], whois)).toBe('Tools.*');
		expect(findDisabledBy(['Tools.*'], ban)).toBeNull();
		expect(findDisabledBy(['*'], ban)).toBe('*');
	});

	test('GIVEN the commands that edit the setting THEN a server cannot disable them', () => {
		expect([...ProtectedCommands].sort()).toEqual(['commands', 'settings']);
	});
});
