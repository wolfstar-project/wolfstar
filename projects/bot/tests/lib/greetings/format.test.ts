import { formatGreeting, pickGreeting } from '#lib/greetings/format';

describe('greetings', () => {
	const context = { user: { id: '266624760782258186', username: 'wolf' }, guild: { name: 'WolfStar', memberCount: 42 } };

	describe('formatGreeting', () => {
		test('GIVEN the placeholders THEN they are replaced, whatever their case', () => {
			expect(formatGreeting('Hi {user} ({username}), welcome to {server}, member #{memberCount}!', context)).toBe(
				'Hi <@266624760782258186> (wolf), welcome to WolfStar, member #42!'
			);
			expect(formatGreeting('{SERVER} has {membercount}', context)).toBe('WolfStar has 42');
			expect(formatGreeting('%user% joined %server%', context)).toBe('<@266624760782258186> joined WolfStar');
		});

		test('GIVEN a role message THEN {role} is the name of the role', () => {
			expect(formatGreeting('{user} is now {role}', { ...context, role: { id: '1', name: 'Verified' } })).toBe(
				'<@266624760782258186> is now Verified'
			);
		});

		test('GIVEN an escaped new line THEN it starts a new line', () => {
			expect(formatGreeting('Hi!\\nRead the rules.', context)).toBe('Hi!\nRead the rules.');
		});

		test('GIVEN an unknown placeholder THEN it is left as it is', () => {
			expect(formatGreeting('Hi {nobody}', context)).toBe('Hi {nobody}');
		});

		test('GIVEN a message that is too long THEN it fits a message of Discord', () => {
			expect(formatGreeting('x'.repeat(3000), context).length).toBe(2000);
		});
	});

	describe('pickGreeting', () => {
		test('GIVEN no message THEN there is none to send', () => {
			expect(pickGreeting([])).toBeNull();
			expect(pickGreeting(['  '])).toBeNull();
		});

		test('GIVEN several messages THEN one is picked at random', () => {
			expect(pickGreeting(['a', 'b', 'c'], () => 0)).toBe('a');
			expect(pickGreeting(['a', 'b', 'c'], () => 0.99)).toBe('c');
		});
	});
});
