import {
	decodeRoleSetupId,
	encodeRoleSetupId,
	ModerationCommandPrompt,
	renderRoleSetupPrompt,
	savePendingRoleSetupCommand,
	takePendingRoleSetupCommand
} from '#lib/moderation/structures/RoleSetupPrompt';
import { TypeVariation } from '#utils/moderationConstants';
import { container } from '@wolfstar/http-framework';
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
	describe('pending command', () => {
		const guildId = '254360814063058944';
		const stored = new Map<string, { value: string; seconds: number }>();
		const redis = {
			set: async (key: string, value: string, _mode: string, seconds: number) => void stored.set(key, { value, seconds }),
			getdel: async (key: string) => {
				const entry = stored.get(key);
				stored.delete(key);
				return entry?.value ?? null;
			}
		};
		let previous: unknown;

		beforeAll(() => {
			previous = (container as any).redis;
			(container as any).redis = redis;
		});

		afterAll(() => {
			(container as any).redis = previous;
		});

		beforeEach(() => stored.clear());

		const pending = { command: 'mute/add', args: { user: { user: { id: '1' } }, reason: 'spam', duration: '1h' } };

		test('GIVEN a command that waits THEN it is kept for a quarter of an hour, and taken once', async () => {
			await savePendingRoleSetupCommand(guildId, ownerId, TypeVariation.Mute, pending);

			expect([...stored.values()].map((entry) => entry.seconds)).toEqual([900]);
			await expect(takePendingRoleSetupCommand(guildId, ownerId, TypeVariation.Mute)).resolves.toEqual(pending);
			await expect(takePendingRoleSetupCommand(guildId, ownerId, TypeVariation.Mute)).resolves.toBeNull();
		});

		test('GIVEN a command that waits THEN it is of its guild, its author and its action', async () => {
			await savePendingRoleSetupCommand(guildId, ownerId, TypeVariation.Mute, pending);

			await expect(takePendingRoleSetupCommand('1', ownerId, TypeVariation.Mute)).resolves.toBeNull();
			await expect(takePendingRoleSetupCommand(guildId, '2', TypeVariation.Mute)).resolves.toBeNull();
			await expect(takePendingRoleSetupCommand(guildId, ownerId, TypeVariation.RestrictedReaction)).resolves.toBeNull();
			await expect(takePendingRoleSetupCommand(guildId, ownerId, TypeVariation.Mute)).resolves.toEqual(pending);
		});

		test('GIVEN the same command run again THEN the last one is the one that waits', async () => {
			await savePendingRoleSetupCommand(guildId, ownerId, TypeVariation.Mute, pending);
			await savePendingRoleSetupCommand(guildId, ownerId, TypeVariation.Mute, { ...pending, args: { reason: 'other' } });

			await expect(takePendingRoleSetupCommand(guildId, ownerId, TypeVariation.Mute)).resolves.toMatchObject({ args: { reason: 'other' } });
		});
	});
});
