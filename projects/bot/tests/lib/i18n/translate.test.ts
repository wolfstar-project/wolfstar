import { translate } from '#lib/i18n/translate';
import { Identifiers } from '@wolfstar/http-framework';

describe('translate', () => {
	test('GIVEN argument identifier THEN returns arguments:{identifier}', () => {
		expect(translate(Identifiers.ArgumentBooleanError)).toBe(`arguments:${Identifiers.ArgumentBooleanError}`);
		expect(translate(Identifiers.ArgumentChannelError)).toBe(`arguments:${Identifiers.ArgumentChannelError}`);
		expect(translate(Identifiers.ArgumentEnumEmptyError)).toBe(`arguments:${Identifiers.ArgumentEnumEmptyError}`);
		expect(translate(Identifiers.ArgumentEnumError)).toBe(`arguments:${Identifiers.ArgumentEnumError}`);
		expect(translate(Identifiers.ArgumentIntegerError)).toBe(`arguments:${Identifiers.ArgumentIntegerError}`);
		expect(translate(Identifiers.ArgumentIntegerTooLarge)).toBe(`arguments:${Identifiers.ArgumentIntegerTooLarge}`);
		expect(translate(Identifiers.ArgumentIntegerTooSmall)).toBe(`arguments:${Identifiers.ArgumentIntegerTooSmall}`);
		expect(translate(Identifiers.ArgumentMemberError)).toBe(`arguments:${Identifiers.ArgumentMemberError}`);
		expect(translate(Identifiers.ArgumentMessageError)).toBe(`arguments:${Identifiers.ArgumentMessageError}`);
		expect(translate(Identifiers.ArgumentNumberError)).toBe(`arguments:${Identifiers.ArgumentNumberError}`);
		expect(translate(Identifiers.ArgumentNumberTooLarge)).toBe(`arguments:${Identifiers.ArgumentNumberTooLarge}`);
		expect(translate(Identifiers.ArgumentNumberTooSmall)).toBe(`arguments:${Identifiers.ArgumentNumberTooSmall}`);
		expect(translate(Identifiers.ArgumentRoleError)).toBe(`arguments:${Identifiers.ArgumentRoleError}`);
		expect(translate(Identifiers.ArgumentStringTooLong)).toBe(`arguments:${Identifiers.ArgumentStringTooLong}`);
		expect(translate(Identifiers.ArgumentStringTooShort)).toBe(`arguments:${Identifiers.ArgumentStringTooShort}`);
		expect(translate(Identifiers.ArgumentUserError)).toBe(`arguments:${Identifiers.ArgumentUserError}`);
	});

	test('GIVEN ArgumentUnavailable THEN returns arguments:unavailable', () => {
		expect(translate(Identifiers.ArgumentUnavailable)).toBe('arguments:unavailable');
	});

	test('GIVEN CommandDisabled THEN returns preconditions:disabledGlobal', () => {
		expect(translate(Identifiers.CommandDisabled)).toBe('preconditions:disabledGlobal');
	});

	test('GIVEN PreconditionCooldown THEN returns preconditions:cooldown', () => {
		expect(translate(Identifiers.PreconditionCooldown)).toBe('preconditions:cooldown');
	});

	test('GIVEN PreconditionNSFW THEN returns preconditions:nsfw', () => {
		expect(translate(Identifiers.PreconditionNSFW)).toBe('preconditions:nsfw');
	});

	test('GIVEN PreconditionClientPermissions THEN returns preconditions:clientPermissions', () => {
		expect(translate(Identifiers.PreconditionClientPermissions)).toBe('preconditions:clientPermissions');
	});

	test('GIVEN PreconditionClientPermissionsNoPermissions THEN returns preconditions:clientPermissionsNoPermissions', () => {
		expect(translate(Identifiers.PreconditionClientPermissionsNoPermissions)).toBe('preconditions:clientPermissionsNoPermissions');
	});

	test('GIVEN PreconditionRunIn THEN returns preconditions:runIn', () => {
		expect(translate(Identifiers.PreconditionRunIn)).toBe('preconditions:runIn');
	});

	test('GIVEN PreconditionUserPermissions THEN returns preconditions:userPermissions', () => {
		expect(translate(Identifiers.PreconditionUserPermissions)).toBe('preconditions:userPermissions');
	});

	test('GIVEN PreconditionUserPermissionsNoPermissions THEN returns preconditions:userPermissionsNoPermissions', () => {
		expect(translate(Identifiers.PreconditionUserPermissionsNoPermissions)).toBe('preconditions:userPermissionsNoPermissions');
	});

	test('GIVEN PreconditionUnavailable THEN returns preconditions:unavailable', () => {
		expect(translate(Identifiers.PreconditionUnavailable)).toBe('preconditions:unavailable');
	});

	test('GIVEN unmapped framework identifier THEN returns identifier', () => {
		expect(translate(Identifiers.ArgumentMissing)).toBe(Identifiers.ArgumentMissing);
		expect(translate(Identifiers.PreconditionGuildIds)).toBe(Identifiers.PreconditionGuildIds);
	});

	test('GIVEN unknown identifier THEN returns identifier', () => {
		expect(translate('does_not_exist')).toBe('does_not_exist');
	});
});
