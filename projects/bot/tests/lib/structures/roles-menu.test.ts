import {
	decodeRolesMenuId,
	encodeRolesMenuId,
	renderRolesList,
	renderRolesPageModal,
	renderRolesPicker,
	renderRoleView,
	RolesPerPage,
	sortRoles,
	type RolesMenuContext,
	type RolesMenuRole
} from '#lib/structures/roles-menu';
import { ComponentType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

const ownerId = '266624760782258186';
const guildId = '254360814063058944';

// Echoes the key and its options, the translations are not what is tested here:
const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)) as never;

function createRole(index: number, overrides: Partial<RolesMenuRole> = {}): RolesMenuRole {
	return {
		id: `${254360814063058000n + BigInt(index)}`,
		name: `role-${index}`,
		color: index * 1000,
		hoist: false,
		mentionable: false,
		position: index,
		permissions: 0n,
		...overrides
	};
}

const roles = sortRoles([createRole(0, { id: guildId }), ...Array.from({ length: 19 }, (_, index) => createRole(index + 1))]);

function createContext(list: readonly RolesMenuRole[] = roles): RolesMenuContext {
	return { t, ownerId, guildName: 'Labotory', roles: list };
}

interface AnyComponent {
	type: ComponentType;
	content?: string;
	custom_id?: string;
	disabled?: boolean;
	accent_color?: number;
	components?: AnyComponent[];
}

function flatten(components: readonly unknown[]): AnyComponent[] {
	return (components as AnyComponent[]).flatMap((component) => [component, ...flatten(component.components ?? [])]);
}

function getText(components: readonly unknown[]) {
	return flatten(components)
		.filter((component) => component.type === ComponentType.TextDisplay)
		.map((component) => component.content)
		.join('\n');
}

function getActions(components: readonly unknown[]) {
	return flatten(components)
		.filter((component) => component.type === ComponentType.Button)
		.map((component) => ({ ...decodeRolesMenuId(component.custom_id!.split('.').slice(1)), disabled: component.disabled === true }));
}

describe('roles menu', () => {
	describe('custom IDs', () => {
		test('GIVEN an action THEN it survives the round trip the framework parser does', () => {
			const action = { ownerId, verb: 'select', page: 3 } as const;
			const id = encodeRolesMenuId(action);

			expect(id).toBe(`roles.${ownerId}.select:3`);
			expect(decodeRolesMenuId(id.split('.').slice(1))).toEqual(action);
		});

		test('GIVEN something else THEN it decodes to null', () => {
			expect(decodeRolesMenuId(null)).toBeNull();
			expect(decodeRolesMenuId([ownerId, 'explode:0'])).toBeNull();
			expect(decodeRolesMenuId([ownerId, 'list:-1'])).toBeNull();
			expect(decodeRolesMenuId([ownerId, 'list'])).toBeNull();
		});
	});

	describe('rendering', () => {
		test('GIVEN the roles THEN they are sorted from the highest, and the list shows them numbered with their mention', () => {
			expect(roles[0].position).toBe(19);
			expect(roles.at(-1)!.id).toBe(guildId);

			const message = renderRolesList(createContext(), 0);
			const text = getText(message.components!);

			expect(message.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
			expect(text).toContain(`**1.** <@&${roles[0].id}>`);
			expect(text).toContain(`**${RolesPerPage}.** <@&${roles[RolesPerPage - 1].id}>`);
			expect(text).not.toContain(`**${RolesPerPage + 1}.**`);
			expect(text).toContain('"server":"Labotory","count":20');
			expect(text).toContain('"page":1,"total":3,"count":20');
		});

		test('GIVEN a page out of range THEN the last one is rendered', () => {
			const text = getText(renderRolesList(createContext(), 99).components!);

			expect(text).toContain('"page":3,"total":3');
			expect(text).toContain(`**17.** <@&${roles[16].id}>`);
		});

		test('GIVEN the middle of the list THEN it can go to the first, previous, next and last page, ask for one and pick a role', () => {
			const actions = getActions(renderRolesList(createContext(), 1).components!);

			expect(actions.map((action) => [action.verb, action.page, action.disabled])).toEqual([
				['list', 0, false],
				['list', 0, false],
				['jump', 1, false],
				['list', 2, false],
				['list', 2, false],
				['pick', 1, false]
			]);
		});

		test('GIVEN the first page THEN it cannot go back, and a single page cannot be jumped in', () => {
			const disabled = (message: ReturnType<typeof renderRolesList>) =>
				getActions(message.components!)
					.filter((action) => action.disabled)
					.map((action) => action.verb);

			expect(disabled(renderRolesList(createContext(), 0))).toEqual(['list', 'list']);
			expect(disabled(renderRolesList(createContext(roles.slice(0, 3)), 0))).toEqual(['list', 'list', 'jump', 'list', 'list']);
		});

		test('GIVEN no roles THEN it says so', () => {
			expect(getText(renderRolesList(createContext([]), 0).components!)).toContain('commands/management:rolesBrowseEmpty');
		});

		test('GIVEN the page of the select menu THEN it has only the select menu of the roles and the button back', () => {
			const message = renderRolesPicker(createContext(), 2);
			const flat = flatten(message.components!);
			const select = flat.find((component) => component.type === ComponentType.RoleSelect)!;

			expect(
				flat.filter((component) =>
					[ComponentType.StringSelect, ComponentType.UserSelect, ComponentType.ChannelSelect].includes(component.type)
				)
			).toEqual([]);
			expect(decodeRolesMenuId(select.custom_id!.split('.').slice(1))).toEqual({ ownerId, verb: 'select', page: 2 });
			expect(getActions(message.components!).map((action) => [action.verb, action.page])).toEqual([['list', 2]]);
		});

		test('GIVEN a role THEN its view has what it is, what it can do, and the buttons back and to pick another', () => {
			const role = createRole(5, {
				color: 0xff0000,
				hoist: true,
				permissions: PermissionFlagsBits.BanMembers | PermissionFlagsBits.KickMembers
			});
			const message = renderRoleView(createContext(), role, 1);
			const text = getText(message.components!);

			expect(text).toContain(`<@&${role.id}>`);
			expect(text).toContain('"hexColor":"#ff0000"');
			expect(text).toContain('"hoisted":"globals:yes"');
			expect(text).toContain('permissions:BanMembers');
			expect(text).toContain('permissions:KickMembers');
			expect(flatten(message.components!).find((component) => component.type === ComponentType.Container)!.accent_color).toBe(0xff0000);
			expect(getActions(message.components!).map((action) => [action.verb, action.page])).toEqual([
				['list', 1],
				['pick', 1]
			]);
		});

		test('GIVEN a role with no permissions or all of them THEN it says so', () => {
			const none = getText(renderRoleView(createContext(), createRole(1), 0).components!);
			const all = getText(renderRoleView(createContext(), createRole(1, { permissions: PermissionFlagsBits.Administrator }), 0).components!);

			expect(none).toContain('commands/management:roleInfoNoPermissions');
			expect(all).toContain('commands/management:roleInfoAll');
		});

		test('GIVEN the modal of the page THEN it asks for a number', () => {
			const modal = renderRolesPageModal(t, ownerId);
			const input = flatten(modal.components).find((component) => component.type === ComponentType.TextInput)!;

			expect(decodeRolesMenuId(modal.custom_id.split('.').slice(1))).toEqual({ ownerId, verb: 'goto', page: 0 });
			expect(input).toMatchObject({ custom_id: 'page', required: true });
		});
	});
});
