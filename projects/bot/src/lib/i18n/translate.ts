import { Identifiers } from '@wolfstar/http-framework';

/**
 * Maps the identifier of an error thrown by the framework to the translation key of its message. An identifier with
 * no mapping is returned as is, so an error can carry its translation key as identifier.
 *
 * @param identifier - The identifier of the error.
 */
export function translate(identifier: string): string {
	switch (identifier) {
		case Identifiers.ArgumentUnavailable:
			return 'arguments:unavailable';
		case Identifiers.ArgumentBooleanError:
		case Identifiers.ArgumentChannelError:
		case Identifiers.ArgumentEnumEmptyError:
		case Identifiers.ArgumentEnumError:
		case Identifiers.ArgumentIntegerError:
		case Identifiers.ArgumentIntegerTooLarge:
		case Identifiers.ArgumentIntegerTooSmall:
		case Identifiers.ArgumentMemberError:
		case Identifiers.ArgumentMessageError:
		case Identifiers.ArgumentNumberError:
		case Identifiers.ArgumentNumberTooLarge:
		case Identifiers.ArgumentNumberTooSmall:
		case Identifiers.ArgumentRoleError:
		case Identifiers.ArgumentStringTooLong:
		case Identifiers.ArgumentStringTooShort:
		case Identifiers.ArgumentUserError:
			return `arguments:${identifier}`;

		case Identifiers.CommandDisabled:
			return 'preconditions:disabledGlobal';
		case Identifiers.PreconditionCooldown:
			return 'preconditions:cooldown';

		case Identifiers.PreconditionNSFW:
			return 'preconditions:nsfw';
		case Identifiers.PreconditionClientPermissions:
			return 'preconditions:clientPermissions';
		case Identifiers.PreconditionClientPermissionsNoPermissions:
			return 'preconditions:clientPermissionsNoPermissions';
		case Identifiers.PreconditionRunIn:
			return 'preconditions:runIn';
		case Identifiers.PreconditionUserPermissions:
			return 'preconditions:userPermissions';
		case Identifiers.PreconditionUserPermissionsNoPermissions:
			return 'preconditions:userPermissionsNoPermissions';
		case Identifiers.PreconditionUnavailable:
			return 'preconditions:unavailable';

		default:
			return identifier;
	}
}
