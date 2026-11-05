import { SettingsMenu } from '#lib/structures/SettingsMenu';
import * as configuration from '#lib/database/settings/configuration';
import { SchemaGroup } from '#lib/database/settings/schema/SchemaGroup';
import { SchemaKey } from '#lib/database/settings/schema/SchemaKey';
import { SettingsMenuAction, parseSettingsMenuCustomId } from '#utils/settingsMenuCustomId';
import { container } from '@sapphire/framework';
import type { TFunction } from '@sapphire/plugin-i18next';
import type { WolfCommand, WolfSubcommand } from '#lib/structures';
import type { MessageComponentInteraction } from 'discord.js';

it('lets administrators reach settings after the first 25 options', async () => {
	const group = new SchemaGroup('::ROOT::');
	const prefix = configuration.getConfiguration().prefix;
	for (let i = 0; i < 30; i++) {
		const key = new SchemaKey({ ...prefix, name: `setting-${i}`, key: `setting-${i}` });
		key.parent = group.add([key.key], key);
	}
	vi.spyOn(configuration, 'getConfigurableGroups').mockReturnValue(group);
	Object.defineProperty(container.client, 'lliCollectors', { value: new Set(), configurable: true });
	let rendered: any;
	const message = {
		id: '123',
		edit: vi.fn(async (payload) => {
			rendered = payload.components[0].toJSON();
		})
	};
	const interaction = {
		user: { id: '456' },
		deferReply: vi.fn(),
		editReply: vi.fn().mockResolvedValue(message)
	} as unknown as WolfSubcommand.Interaction;
	const menu = new SettingsMenu(interaction, ((key: string) => key) as TFunction);
	try {
		await menu.init({} as WolfCommand.RunContext);
		const options = () =>
			rendered.components.flatMap((row: any) => row.components ?? []).find((component: any) => component.options)?.options ?? [];
		const seen = options().map((option: any) => option.value);
		const next = rendered.components
			.flatMap((row: any) => row.components ?? [])
			.find((component: any) => component.custom_id && parseSettingsMenuCustomId(component.custom_id)?.action === SettingsMenuAction.NextPage);
		const collector = [...container.client.lliCollectors][0];
		await collector.listener!({
			message,
			user: interaction.user,
			customId: next.custom_id,
			isStringSelectMenu: () => false,
			isButton: () => true,
			deferUpdate: vi.fn()
		} as unknown as MessageComponentInteraction);
		seen.push(...options().map((option: any) => option.value));
		expect(seen).toEqual(Array.from({ length: 30 }, (_, i) => `setting-${i}`));
	} finally {
		for (const collector of container.client.lliCollectors) collector.setEndListener(() => {}).end();
		vi.restoreAllMocks();
	}
});
