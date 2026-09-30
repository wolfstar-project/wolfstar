import { translate } from '#lib/i18n/translate';
import { Identifiers } from '@sapphire/framework';

describe('translate', () => {
	test('GIVEN argument identifier THEN returns arguments:{identifier}', () => {
		expect(translate(Identifiers.ArgumentBooleanError)).toBe(`arguments:${Identifiers.ArgumentBooleanError}`);
		expect(translate(Identifiers.ArgumentChannelError)).toBe(`arguments:${Identifiers.ArgumentChannelError}`);
		expect(translate(Identifiers.ArgumentDateError)).toBe(`arguments:${Identifiers.ArgumentDateError}`);
		expect(translate(Identifiers.ArgumentDateTooEarly)).toBe(`arguments:${Identifiers.ArgumentDateTooEarly}`);
		expect(translate(Identifiers.ArgumentDateTooFar)).toBe(`arguments:${Identifiers.ArgumentDateTooFar}`);
		expect(translate(Identifiers.ArgumentDMChannelError)).toBe(`arguments:${Identifiers.ArgumentDMChannelError}`);
		expect(translate(Identifiers.ArgumentFloatError)).toBe(`arguments:${Identifiers.ArgumentFloatError}`);
		expect(translate(Identifiers.ArgumentFloatTooLarge)).toBe(`arguments:${Identifiers.ArgumentFloatTooLarge}`);
		expect(translate(Identifiers.ArgumentFloatTooSmall)).toBe(`arguments:${Identifiers.ArgumentFloatTooSmall}`);
		expect(translate(Identifiers.ArgumentGuildCategoryChannelError)).toBe(`arguments:${Identifiers.ArgumentGuildCategoryChannelError}`);
		expect(translate(Identifiers.ArgumentGuildChannelError)).toBe(`arguments:${Identifiers.ArgumentGuildChannelError}`);
		expect(translate(Identifiers.ArgumentGuildChannelMissingGuildError)).toBe(`arguments:${Identifiers.ArgumentGuildChannelMissingGuildError}`);
		expect(translate(Identifiers.ArgumentGuildNewsChannelError)).toBe(`arguments:${Identifiers.ArgumentGuildNewsChannelError}`);
		expect(translate(Identifiers.ArgumentGuildNewsThreadChannelError)).toBe(`arguments:${Identifiers.ArgumentGuildNewsThreadChannelError}`);
		expect(translate(Identifiers.ArgumentGuildPrivateThreadChannelError)).toBe(`arguments:${Identifiers.ArgumentGuildPrivateThreadChannelError}`);
		expect(translate(Identifiers.ArgumentGuildPublicThreadChannelError)).toBe(`arguments:${Identifiers.ArgumentGuildPublicThreadChannelError}`);
		expect(translate(Identifiers.ArgumentGuildStageVoiceChannelError)).toBe(`arguments:${Identifiers.ArgumentGuildStageVoiceChannelError}`);
		expect(translate(Identifiers.ArgumentGuildTextChannelError)).toBe(`arguments:${Identifiers.ArgumentGuildTextChannelError}`);
		expect(translate(Identifiers.ArgumentGuildThreadChannelError)).toBe(`arguments:${Identifiers.ArgumentGuildThreadChannelError}`);
		expect(translate(Identifiers.ArgumentGuildVoiceChannelError)).toBe(`arguments:${Identifiers.ArgumentGuildVoiceChannelError}`);
		expect(translate(Identifiers.ArgumentHyperlinkError)).toBe(`arguments:${Identifiers.ArgumentHyperlinkError}`);
		expect(translate(Identifiers.ArgumentIntegerError)).toBe(`arguments:${Identifiers.ArgumentIntegerError}`);
		expect(translate(Identifiers.ArgumentIntegerTooLarge)).toBe(`arguments:${Identifiers.ArgumentIntegerTooLarge}`);
		expect(translate(Identifiers.ArgumentIntegerTooSmall)).toBe(`arguments:${Identifiers.ArgumentIntegerTooSmall}`);
		expect(translate(Identifiers.ArgumentMemberError)).toBe(`arguments:${Identifiers.ArgumentMemberError}`);
		expect(translate(Identifiers.ArgumentMemberMissingGuild)).toBe(`arguments:${Identifiers.ArgumentMemberMissingGuild}`);
		expect(translate(Identifiers.ArgumentMessageError)).toBe(`arguments:${Identifiers.ArgumentMessageError}`);
		expect(translate(Identifiers.ArgumentNumberError)).toBe(`arguments:${Identifiers.ArgumentNumberError}`);
		expect(translate(Identifiers.ArgumentNumberTooLarge)).toBe(`arguments:${Identifiers.ArgumentNumberTooLarge}`);
		expect(translate(Identifiers.ArgumentNumberTooSmall)).toBe(`arguments:${Identifiers.ArgumentNumberTooSmall}`);
		expect(translate(Identifiers.ArgumentRoleError)).toBe(`arguments:${Identifiers.ArgumentRoleError}`);
		expect(translate(Identifiers.ArgumentRoleMissingGuild)).toBe(`arguments:${Identifiers.ArgumentRoleMissingGuild}`);
		expect(translate(Identifiers.ArgumentStringTooLong)).toBe(`arguments:${Identifiers.ArgumentStringTooLong}`);
		expect(translate(Identifiers.ArgumentStringTooShort)).toBe(`arguments:${Identifiers.ArgumentStringTooShort}`);
		expect(translate(Identifiers.ArgumentUserError)).toBe(`arguments:${Identifiers.ArgumentUserError}`);
	});

	test('GIVEN ArgsUnavailable THEN returns arguments:unavailable', () => {
		expect(translate(Identifiers.ArgsUnavailable)).toBe('arguments:unavailable');
	});

	test('GIVEN ArgsMissing THEN returns arguments:missing', () => {
		expect(translate(Identifiers.ArgsMissing)).toBe('arguments:missing');
	});

	test('GIVEN CommandDisabled THEN returns preconditions:disabledGlobal', () => {
		expect(translate(Identifiers.CommandDisabled)).toBe('preconditions:disabledGlobal');
	});

	test('GIVEN PreconditionCooldown THEN returns preconditions:cooldown', () => {
		expect(translate(Identifiers.PreconditionCooldown)).toBe('preconditions:cooldown');
	});

	test('GIVEN PreconditionDMOnly THEN returns preconditions:dmOnly', () => {
		expect(translate(Identifiers.PreconditionDMOnly)).toBe('preconditions:dmOnly');
	});

	test('GIVEN PreconditionGuildNewsOnly THEN returns preconditions:guildNewsOnly', () => {
		expect(translate(Identifiers.PreconditionGuildNewsOnly)).toBe('preconditions:guildNewsOnly');
	});

	test('GIVEN PreconditionGuildNewsThreadOnly THEN returns preconditions:guildNewsThreadOnly', () => {
		expect(translate(Identifiers.PreconditionGuildNewsThreadOnly)).toBe('preconditions:guildNewsThreadOnly');
	});

	test('GIVEN PreconditionGuildOnly THEN returns preconditions:guildOnly', () => {
		expect(translate(Identifiers.PreconditionGuildOnly)).toBe('preconditions:guildOnly');
	});

	test('GIVEN PreconditionGuildPrivateThreadOnly THEN returns preconditions:guildPrivateThreadOnly', () => {
		expect(translate(Identifiers.PreconditionGuildPrivateThreadOnly)).toBe('preconditions:guildPrivateThreadOnly');
	});

	test('GIVEN PreconditionGuildPublicThreadOnly THEN returns preconditions:guildPublicThreadOnly', () => {
		expect(translate(Identifiers.PreconditionGuildPublicThreadOnly)).toBe('preconditions:guildPublicThreadOnly');
	});

	test('GIVEN PreconditionGuildTextOnly THEN returns preconditions:guildTextOnly', () => {
		expect(translate(Identifiers.PreconditionGuildTextOnly)).toBe('preconditions:guildTextOnly');
	});

	test('GIVEN PreconditionNSFW THEN returns preconditions:nsfw', () => {
		expect(translate(Identifiers.PreconditionNSFW)).toBe('preconditions:nsfw');
	});

	test('GIVEN PreconditionClientPermissions THEN returns preconditions:clientPermissions', () => {
		expect(translate(Identifiers.PreconditionClientPermissions)).toBe('preconditions:clientPermissions');
	});

	test('GIVEN PreconditionUserPermissions THEN returns preconditions:userPermissions', () => {
		expect(translate(Identifiers.PreconditionUserPermissions)).toBe('preconditions:userPermissions');
	});

	test('GIVEN PreconditionThreadOnly THEN returns preconditions:threadOnly', () => {
		expect(translate(Identifiers.PreconditionThreadOnly)).toBe('preconditions:threadOnly');
	});

	test('GIVEN unknown identifier THEN returns identifier', () => {
		expect(translate('does_not_exist')).toBe('does_not_exist');
	});
});
