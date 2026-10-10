import { decodeRoleSetupId, encodeRoleSetupId, ModerationCommandPrompt, renderRoleSetupPrompt } from '#lib/moderation/structures/RoleSetupPrompt';
import { TypeVariation } from '#utils/moderationConstants';
import { ButtonStyle, ComponentType } from 'discord-api-types/v10';

const ownerId = '266624760782258186';

// Echoes the key, the translations are not what is tested here:
const t = ((key: string) => key) as never;

interface AnyComponent {
	type: ComponentType;
	custom_id?: string;
	style?: ButtonStyle;
	min_values?: number;
	max_values?: number;
	components?: AnyComponent[];
}

function flatten(components: readonly unknown[]): AnyComponent[] {
	return (components as AnyComponent[]).flatMap((component) => [component, ...flatten(component.components ?? [])]);
}

describe('role setup prompt', () => {
	describe('custom IDs', () => {
		test('GIVEN an action THEN it survives the round trip the framework parser does', () => {
			const action = { ownerId, verb: 'existing', type: TypeVariation.Mute } as const;
			const id = encodeRoleSetupId(action);

			expect(id).toBe(`roleSetup.${ownerId}.existing:${TypeVariation.Mute}`);
			expect(decodeRoleSetupId(id.split('.').slice(1))).toEqual(action);
		});

		test('GIVEN something else THEN it decodes to null', () => {
			expect(decodeRoleSetupId(null)).toBeNull();
			expect(decodeRoleSetupId([ownerId, 'explode:1'])).toBeNull();
			expect(decodeRoleSetupId([ownerId, 'create:-1'])).toBeNull();
			expect(decodeRoleSetupId([ownerId, 'create:x'])).toBeNull();
			expect(decodeRoleSetupId([ownerId, 'create'])).toBeNull();
		});
	});

	describe('rendering', () => {
		const message = renderRoleSetupPrompt(t, ownerId, TypeVariation.Mute);
		const flat = flatten(message.components!);

		test('GIVEN the prompt THEN it asks, and mentions nobody', () => {
			expect(message.content).toBe('moderationActions:sharedRoleSetupPrompt');
			expect(message.allowed_mentions).toEqual({ parse: [] });
		});

		test('GIVEN the prompt THEN one role can be picked in a select menu of the roles', () => {
			const select = flat.find((component) => component.type === ComponentType.RoleSelect)!;

			expect(decodeRoleSetupId(select.custom_id!.split('.').slice(1))).toEqual({ ownerId, verb: 'existing', type: TypeVariation.Mute });
			expect(select).toMatchObject({ min_values: 1, max_values: 1 });
		});

		test('GIVEN the prompt THEN a button creates a role and another one cancels', () => {
			const buttons = flat.filter((component) => component.type === ComponentType.Button);

			expect(buttons.map((button) => decodeRoleSetupId(button.custom_id!.split('.').slice(1))?.verb)).toEqual(['create', 'cancel']);
			expect(buttons.map((button) => button.style)).toEqual([ButtonStyle.Primary, ButtonStyle.Secondary]);
		});

		test('GIVEN the type of an action THEN every component carries it', () => {
			const restricted = flatten(renderRoleSetupPrompt(t, ownerId, TypeVariation.RestrictedReaction).components!);
			const types = restricted
				.filter((component) => component.custom_id !== undefined)
				.map((component) => decodeRoleSetupId(component.custom_id!.split('.').slice(1))?.type);

			expect(types).toEqual([TypeVariation.RestrictedReaction, TypeVariation.RestrictedReaction, TypeVariation.RestrictedReaction]);
		});

		test('GIVEN a prompt that is thrown THEN it carries its message', () => {
			expect(new ModerationCommandPrompt(message).message).toBe(message);
		});
	});
});
