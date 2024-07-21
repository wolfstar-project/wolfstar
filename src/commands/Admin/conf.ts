import { configurableGroups, isSchemaGroup, isSchemaKey, readSettings, remove, reset, SchemaKey, set, writeSettingsTransaction } from '#lib/database';
import { LanguageKeys } from '#lib/i18n/languageKeys';
import { SettingsMenu, WolfSubcommand } from '#lib/structures';
import type { GuildMessage } from '#lib/types';
import { PermissionLevels } from '#lib/types';
import { isValidCustomEmoji, isValidSerializedTwemoji, isValidTwemoji } from '#lib/util/functions/emojis';
import { inlineCode } from '@discordjs/builders';
import { ApplyOptions, RequiresClientPermissions } from '@sapphire/decorators';
import { CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { filter } from '@sapphire/iterator-utilities/filter';
import { map } from '@sapphire/iterator-utilities/map';
import { send } from '@sapphire/plugin-editable-commands';
import { toTitleCase } from '@sapphire/utilities';
import { PermissionFlagsBits } from 'discord.js';

@ApplyOptions<WolfSubcommand.Options>({
	aliases: ['settings', 'config', 'configs', 'configuration'],
	description: LanguageKeys.Commands.Admin.ConfDescription,
	detailedDescription: LanguageKeys.Commands.Admin.ConfExtended,
	guarded: true,
	permissionLevel: PermissionLevels.Administrator,
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	subcommands: [
		{ name: 'set', messageRun: 'set' },
		{ name: 'add', messageRun: 'set' },
		{ name: 'show', messageRun: 'show' },
		{ name: 'remove', messageRun: 'remove' },
		{ name: 'reset', messageRun: 'reset' },
		{ name: 'menu', messageRun: 'menu', default: true }
	]
})
export class UserCommand extends WolfSubcommand {
	@RequiresClientPermissions(PermissionFlagsBits.EmbedLinks)
	public menu(message: GuildMessage, args: WolfSubcommand.Args, context: WolfSubcommand.RunContext) {
		return new SettingsMenu(message, args.t).init(context);
	}

	public async show(message: GuildMessage, args: WolfSubcommand.Args) {
		const key = args.finished ? '' : await args.pick('string');
		const schemaValue = configurableGroups.getPathString(key.toLowerCase());
		if (schemaValue === null) this.error(LanguageKeys.Commands.Admin.ConfGetNoExt, { key });

		const settings = await readSettings(message.guild);
		const output = schemaValue.display(settings, args.t);

		if (isSchemaKey(schemaValue)) {
			const content = args.t(LanguageKeys.Commands.Admin.ConfGet, { key: schemaValue.name, value: output });
			return send(message, { content, allowedMentions: { users: [], roles: [] } });
		}

		const title = key
			? `: ${key
					.split('.')
					.map((key) => toTitleCase(key))
					.join('/')}`
			: '';
		return send(message, {
			content: args.t(LanguageKeys.Commands.Admin.Conf, { key: title, list: output }),
			allowedMentions: { users: [], roles: [] }
		});
	}

	public async set(message: GuildMessage, args: WolfSubcommand.Args) {
		const [key, schemaKey] = await this.fetchKey(args);

		await using trx = await writeSettingsTransaction(message.guild);
		await trx.write(await set(trx.settings, schemaKey, args)).submit();

		const response = schemaKey.display(trx.settings, args.t);
		return send(message, {
			content: args.t(LanguageKeys.Commands.Admin.ConfUpdated, { key, response: this.getTextResponse(response) }),
			allowedMentions: { users: [], roles: [] }
		});
	}

	public async remove(message: GuildMessage, args: WolfSubcommand.Args) {
		const [key, schemaKey] = await this.fetchKey(args);

		await using trx = await writeSettingsTransaction(message.guild);
		await trx.write(await remove(trx.settings, schemaKey, args)).submit();

		const response = schemaKey.display(trx.settings, args.t);
		return send(message, {
			content: args.t(LanguageKeys.Commands.Admin.ConfUpdated, { key, response: this.getTextResponse(response) }),
			allowedMentions: { users: [], roles: [] }
		});
	}

	public async reset(message: GuildMessage, args: WolfSubcommand.Args) {
		const [key, schemaKey] = await this.fetchKey(args);

		await using trx = await writeSettingsTransaction(message.guild);
		await trx.write(reset(schemaKey)).submit();

		const response = schemaKey.display(trx.settings, args.t);
		return send(message, {
			content: args.t(LanguageKeys.Commands.Admin.ConfReset, { key, value: response }),
			allowedMentions: { users: [], roles: [] }
		});
	}

	private getTextResponse(response: string) {
		return isValidCustomEmoji(response) || isValidSerializedTwemoji(response) || isValidTwemoji(response) ? response : inlineCode(response);
	}

	private async fetchKey(args: WolfSubcommand.Args) {
		const key = await args.pick('string');
		const value = configurableGroups.getPathString(key.toLowerCase());
		if (value === null) this.error(LanguageKeys.Commands.Admin.ConfGetNoExt, { key });
		if (value.dashboardOnly) this.error(LanguageKeys.Commands.Admin.ConfDashboardOnlyKey, { key });
		if (isSchemaGroup(value)) {
			this.error(LanguageKeys.Settings.Gateway.ChooseKey, {
				keys: [
					...map(
						filter(value.childValues(), (value) => !value.dashboardOnly),
						(value) => `\`${value.name}\``
					)
				]
			});
		}

		return [value.name, value as SchemaKey] as const;
	}
}
