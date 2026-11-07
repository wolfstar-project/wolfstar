import { CommandMatcher } from '#lib/database';
import type { Command } from '@wolfstar/http-framework';
import { createCommand } from '../mocks/MockInstances.js';

describe('CommandMatcher', () => {
	// The category and the sub-category of a command are the directories of its file:
	const command: Command = createCommand('ping', 'General');
	const commandWithSubCategory: Command = createCommand('define', 'Tools', 'Dictionary');
	createCommand('balance', 'Currency');

	describe('match', () => {
		test('GIVEN match-all THEN always passes test', () => {
			expect(CommandMatcher.match('*', command)).toBe(true);
		});

		test('GIVEN non-namespaced match with correct command name THEN passes test', () => {
			expect(CommandMatcher.match('ping', command)).toBe(true);
		});

		test('GIVEN namespaced match with correct category THEN passes test', () => {
			expect(CommandMatcher.match('General.*', command)).toBe(true);
		});

		test('GIVEN namespaced match with correct category and sub-category THEN passes test', () => {
			expect(CommandMatcher.match('Tools.Dictionary.*', commandWithSubCategory)).toBe(true);
		});

		test('GIVEN the old name of a renamed command THEN it matches the command that took its place', () => {
			const settings = createCommand('settings', 'Management');

			expect(CommandMatcher.match('conf', settings)).toBe(true);
			expect(CommandMatcher.match('Management.conf', settings)).toBe(true);
			expect(CommandMatcher.match('conf', command)).toBe(false);
		});

		test('GIVEN non-namespaced match with incorrect command name THEN fails test', () => {
			expect(CommandMatcher.match('eval', command)).toBe(false);
		});

		test('GIVEN namespaced match with incorrect category THEN fails test', () => {
			expect(CommandMatcher.match('Animal.*', command)).toBe(false);
		});

		test('GIVEN namespaced match with incorrect category and correct sub-category THEN fails test', () => {
			expect(CommandMatcher.match('Admin.Chat Bot Info.*', command)).toBe(false);
		});

		test('GIVEN namespaced match with correct category and incorrect sub-category THEN fails test', () => {
			expect(CommandMatcher.match('General.General.*', command)).toBe(false);
		});

		test('GIVEN namespaced match with incorrect category and incorrect sub-category THEN fails test', () => {
			expect(CommandMatcher.match('Animal.General.*', command)).toBe(false);
		});

		test('GIVEN namespaced match with correct category, correct sub-category, and correct command name THEN passes test', () => {
			expect(CommandMatcher.match('Tools.Dictionary.define', commandWithSubCategory)).toBe(true);
		});

		test('GIVEN namespaced match with correct category, and incorrect command name THEN fails test', () => {
			expect(CommandMatcher.match('General.eval', command)).toBe(false);
		});
	});

	describe('resolve', () => {
		test('GIVEN empty string THEN returns null', () => {
			expect(CommandMatcher.resolve('')).toBe(null);
		});

		test('GIVEN match-all THEN returns match-all', () => {
			expect(CommandMatcher.resolve('*')).toBe('*');
		});

		test('GIVEN correct command name THEN returns command name', () => {
			expect(CommandMatcher.resolve('ping')).toBe('ping');
		});

		test('GIVEN correct command name in upper cases THEN returns command name', () => {
			expect(CommandMatcher.resolve('PING')).toBe('ping');
		});

		test('GIVEN incorrect command name THEN returns null', () => {
			expect(CommandMatcher.resolve('eval')).toBe(null);
		});

		test('GIVEN correct category THEN returns category', () => {
			expect(CommandMatcher.resolve('General.*')).toBe('General.*');
		});

		test('GIVEN correct category in lower cases THEN returns category', () => {
			expect(CommandMatcher.resolve('general.*')).toBe('General.*');
		});

		test('GIVEN correct category in upper cases THEN returns category', () => {
			expect(CommandMatcher.resolve('GENERAL.*')).toBe('General.*');
		});

		test('GIVEN incorrect category THEN returns null', () => {
			expect(CommandMatcher.resolve('Admin.*')).toBe(null);
		});

		test('GIVEN correct category and command name THEN returns command name', () => {
			expect(CommandMatcher.resolve('Currency.balance')).toBe('balance');
		});

		test('GIVEN correct category and command name in lower cases THEN returns command name', () => {
			expect(CommandMatcher.resolve('currency.balance')).toBe('balance');
		});

		test('GIVEN correct category and command name in upper cases THEN returns command name', () => {
			expect(CommandMatcher.resolve('CURRENCY.BALANCE')).toBe('balance');
		});

		test('GIVEN correct category and correct sub-category THEN returns category and sub-category', () => {
			expect(CommandMatcher.resolve('Tools.Dictionary.*')).toBe('Tools.Dictionary.*');
		});

		test('GIVEN correct category and correct sub-category in lower cases THEN returns category and sub-category', () => {
			expect(CommandMatcher.resolve('tools.dictionary.*')).toBe('Tools.Dictionary.*');
		});

		test('GIVEN correct category and correct sub-category in upper cases THEN returns category and sub-category', () => {
			expect(CommandMatcher.resolve('TOOLS.DICTIONARY.*')).toBe('Tools.Dictionary.*');
		});

		test('GIVEN correct category and incorrect sub-category THEN returns null', () => {
			expect(CommandMatcher.resolve('Tools.NotDictionary.*')).toBe(null);
		});

		test('GIVEN correct category, correct sub-category, and correct command name THEN returns command name', () => {
			expect(CommandMatcher.resolve('Tools.Dictionary.define')).toBe('define');
		});

		test('GIVEN correct category, correct sub-category, and correct command name in lower cases THEN returns command name', () => {
			expect(CommandMatcher.resolve('tools.dictionary.define')).toBe('define');
		});

		test('GIVEN correct category, correct sub-category, and correct command name in upper cases THEN returns command name', () => {
			expect(CommandMatcher.resolve('TOOLS.DICTIONARY.DEFINE')).toBe('define');
		});

		test('GIVEN correct category, correct sub-category, and incorrect command name THEN returns null', () => {
			expect(CommandMatcher.resolve('Tools.Dictionary.eval')).toBe(null);
		});

		test('GIVEN string with too many parts THEN returns null', () => {
			expect(CommandMatcher.resolve('never.gonna.say.goodbye')).toBe(null);
		});
	});
});
