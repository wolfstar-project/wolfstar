import { readSettings } from '#lib/database';
import { ConfigurationFileName, createConfigurationFile } from '#lib/database/settings/transfer/format';
import { parseConfigurationFile } from '#lib/database/settings/transfer/parse';
import { PendingImportSeconds, renderSettingsImportButtons, savePendingImport } from '#lib/database/settings/transfer/pending';
import { planConfigurationImport } from '#lib/database/settings/transfer/plan';
import { renderConfigurationIssues, renderConfigurationPreview } from '#lib/database/settings/transfer/render';
import { readAutoModerationRules } from '#lib/moderation/automod/rules';
import type { Translator } from '#lib/structures/commands/utils';
import { resolveGuild, seconds } from '#common';
import { Emojis } from '#utils/emojis';
import { time, TimestampStyles } from '@discordjs/formatters';
import type { RawFile } from '@discordjs/rest';
import type { APIActionRowComponent, APIButtonComponent, APIEmbed, Snowflake } from 'discord-api-types/v10';

/**
 * The message the export of a server is answered with: how much it holds, and the file.
 */
export interface ConfigurationExportMessage {
	content: string;
	files: RawFile[];
}

/**
 * Exports the settings of a server that do not depend on it and its auto-moderation rules, as the JSON file the import
 * reads: to set up another server the same way, or to keep a copy before changing a lot.
 *
 * @remarks What names something of the server (roles, channels, users, and so the exempt roles and channels of the
 * rules) is not in the file, see `format.ts`.
 *
 * @param guildId - The server to export.
 * @param t - The function to translate with, in the language of the administrator.
 */
export async function createConfigurationExportMessage(guildId: Snowflake, t: Translator): Promise<ConfigurationExportMessage> {
	const [settings, rules] = await Promise.all([readSettings(guildId), readAutoModerationRules(guildId)]);
	const file = createConfigurationFile(settings, rules);

	return {
		content: t('commands/conf:transferExportDone', { settings: Object.keys(file.settings).length, rules: file.automod.rules.length }),
		files: [{ name: ConfigurationFileName, data: Buffer.from(JSON.stringify(file, null, '\t'), 'utf8'), contentType: 'application/json' }]
	};
}

/**
 * The message an import is answered with: why the file was refused, that it changes nothing, or the preview of what it
 * changes with the buttons that confirm it.
 */
export interface ConfigurationImportMessage {
	content: string;
	embeds: APIEmbed[];
	components: APIActionRowComponent<APIButtonComponent>[];
}

export interface ConfigurationImportOptions {
	guildId: Snowflake;

	/**
	 * The administrator who imports the file, the only one that can confirm it.
	 */
	ownerId: Snowflake;

	/**
	 * The ID the import waits under, the ID of the interaction that brought the file: two imports of an administrator
	 * are two previews, and each button confirms its own.
	 */
	importId: Snowflake;

	/**
	 * What the file holds, which is not trusted.
	 */
	text: string;
	t: Translator;
}

/**
 * Reads a file the export made and shows what it would change, before anything is written.
 *
 * @remarks
 *
 * - The file is not trusted: every setting goes through the validation it has when it is edited, and a file with a single
 *   problem is refused whole, with every problem it has. What depends on the server is left as it is.
 * - Nothing waits in this process for the answer: what the file holds is kept in Redis for five minutes and the buttons
 *   are answered by the `settingsImport` interaction handler, on whichever process gets the click.
 * - What is written is worked out again when the administrator confirms, from what the database has by then, and it is one
 *   database transaction: the settings and the rules are all written or none is. See `apply.ts`.
 */
export async function createConfigurationImportMessage(options: ConfigurationImportOptions): Promise<ConfigurationImportMessage> {
	const { guildId, ownerId, importId, text, t } = options;
	const reply = (content: string): ConfigurationImportMessage => ({ content, embeds: [], components: [] });

	const [settings, guild, rules] = await Promise.all([readSettings(guildId), resolveGuild(guildId), readAutoModerationRules(guildId)]);
	const parsed = await parseConfigurationFile(text, { settings, rules, guild, t });
	if (!parsed.ok) return reply(renderConfigurationIssues(parsed.issues, t));

	const plan = planConfigurationImport(settings, rules, parsed.value);
	if (plan.isEmpty) return reply(t('commands/conf:transferNothing'));

	// What the file holds waits in Redis for the click, which may reach another process than this one:
	await savePendingImport(guildId, ownerId, importId, parsed.value);

	const embed = await renderConfigurationPreview(plan, { settings, guild, t });
	const expiresAt = new Date(Date.now() + seconds(PendingImportSeconds));
	return {
		content: `-# ${Emojis.Hourglass} ${t('commands/conf:transferImportExpires', { time: time(expiresAt, TimestampStyles.RelativeTime) })}`,
		embeds: [embed],
		components: [renderSettingsImportButtons(t, ownerId, importId)]
	};
}
