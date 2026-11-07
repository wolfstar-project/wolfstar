import { CommandPermissionLevel, getRequiredCommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';

function decorate(prototype: object, method: string, level: CommandPermissionLevel) {
	RequiresCommandPermissionLevel(level)(prototype, method, Object.getOwnPropertyDescriptor(prototype, method)!);
}

describe('getRequiredCommandPermissionLevel', () => {
	test('GIVEN a piece whose chatInputRun requires a level THEN it is read, from a class that extends it too', () => {
		class Administrators {
			public chatInputRun() {
				return null;
			}
		}
		decorate(Administrators.prototype, 'chatInputRun', CommandPermissionLevel.Administrator);
		class Extended extends Administrators {}

		expect(getRequiredCommandPermissionLevel(new Administrators())).toBe(CommandPermissionLevel.Administrator);
		expect(getRequiredCommandPermissionLevel(new Extended())).toBe(CommandPermissionLevel.Administrator);
	});

	test('GIVEN a chatInputRun with no level, or one that replaces a decorated one THEN it requires none', () => {
		class Everyone {
			public chatInputRun() {
				return null;
			}
		}
		class Administrators {
			public chatInputRun() {
				return null;
			}
		}
		decorate(Administrators.prototype, 'chatInputRun', CommandPermissionLevel.Administrator);
		class Replaced extends Administrators {
			public override chatInputRun() {
				return null;
			}
		}

		expect(getRequiredCommandPermissionLevel(new Everyone())).toBeNull();
		expect(getRequiredCommandPermissionLevel(new Replaced())).toBeNull();
	});

	test('GIVEN the level of another method THEN it is not the one of the chat input method', () => {
		class Autocomplete {
			public autocompleteRun() {
				return null;
			}
		}
		decorate(Autocomplete.prototype, 'autocompleteRun', CommandPermissionLevel.Moderator);

		expect(getRequiredCommandPermissionLevel(new Autocomplete())).toBeNull();
	});
});
