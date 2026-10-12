import { findPortableKey } from '#lib/database/settings/transfer/format';
import type { ParsedConfiguration } from '#lib/database/settings/transfer/parse';
import type { Translator } from '#lib/structures/commands/utils';
import { minutes } from '#common';
import { cutText } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import { ButtonStyle, ComponentType, type APIActionRowComponent, type APIButtonComponent, type Snowflake } from 'discord-api-types/v10';

/**
 * The name of the interaction handler that confirms an import, which is also the first part of its custom IDs.
 */
export const SettingsImportHandlerName = 'settingsImport';

/**
 * How long an administrator has to confirm an import, in seconds. The preview they decide on is of the server as it was
 * when the file was read, so it is not kept for long.
 */
export const PendingImportSeconds = minutes.toSeconds(5);

/**
 * What a button of the preview of an import does: `confirm` writes the file to the server, `cancel` forgets it.
 */
export type SettingsImportVerb = 'confirm' | 'cancel';

export interface SettingsImportAction {
	/**
	 * The administrator who ran the command, the only one that can answer.
	 */
	ownerId: Snowflake;
	verb: SettingsImportVerb;

	/**
	 * The ID of the import that waits, which is the ID of the interaction of the command: two imports of an
	 * administrator are two previews, and each button confirms its own.
	 */
	importId: Snowflake;
}

/**
 * Builds the custom ID of a button of the preview, `settingsImport.<ownerId>.<verb>:<importId>`.
 *
 * @remarks The ID says which import a click answers, and the import itself waits in Redis: the process that gets the
 * click is not always the one that showed the preview.
 */
export function encodeSettingsImportId(action: SettingsImportAction) {
	return encodeCustomId(SettingsImportHandlerName, action.ownerId, `${action.verb}:${action.importId}`);
}

const Verbs = new Set<string>(['confirm', 'cancel']);

/**
 * Reads what {@linkcode encodeSettingsImportId} wrote from the content the framework parsed out of a custom ID.
 *
 * @returns The action, or `null` when the custom ID is not one of the preview.
 */
export function decodeSettingsImportId(content: unknown): SettingsImportAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null) return null;

	const [verb, importId] = decoded.action.split(':');
	if (verb === undefined || !Verbs.has(verb) || importId === undefined || !/^\d{17,20}$/.test(importId)) return null;

	return { ownerId: decoded.sessionId, verb: verb as SettingsImportVerb, importId };
}

/**
 * The buttons under the preview of an import: one to confirm it and one to cancel.
 *
 * @param t - The function to translate with, in the language of the administrator.
 * @param ownerId - The administrator who ran the command.
 * @param importId - The ID the import waits under, see {@linkcode savePendingImport}.
 */
export function renderSettingsImportButtons(t: Translator, ownerId: Snowflake, importId: Snowflake): APIActionRowComponent<APIButtonComponent> {
	const button = (verb: SettingsImportVerb, style: ButtonStyle.Primary | ButtonStyle.Secondary, label: string): APIButtonComponent => ({
		type: ComponentType.Button,
		custom_id: encodeSettingsImportId({ ownerId, verb, importId }),
		style,
		label: cutText(label, 80)
	});

	return {
		type: ComponentType.ActionRow,
		components: [
			button('confirm', ButtonStyle.Primary, t('commands/conf:transferImportConfirm')),
			button('cancel', ButtonStyle.Secondary, t('commands/conf:transferImportCancel'))
		]
	};
}

/**
 * An import as it waits in Redis: the settings by their name, since a key of the schema is not data, and the rules.
 */
interface StoredImport {
	settings: [name: string, value: unknown][];
	rules: ParsedConfiguration['rules'];
}

function getPendingKey(guildId: Snowflake, ownerId: Snowflake, importId: Snowflake) {
	return `wolfstar:settings:import:${guildId}:${ownerId}:${importId}`;
}

/**
 * Keeps what a file holds until the administrator confirms the import, for {@linkcode PendingImportSeconds}.
 *
 * @remarks It is in Redis, so it is there for whichever process handles the click: with the sharder the shards share the
 * port of the interactions, and the one that gets the click is not always the one that read the file. It is what the
 * file holds and not what it would change: the changes are worked out again when the import is written.
 *
 * @param guildId - The server the file is imported in.
 * @param ownerId - The administrator who ran the command.
 * @param importId - The ID of the import, the ID of the interaction of the command.
 * @param parsed - What the file holds, see `parseConfigurationFile`.
 */
export async function savePendingImport(guildId: Snowflake, ownerId: Snowflake, importId: Snowflake, parsed: ParsedConfiguration) {
	const stored: StoredImport = { settings: parsed.settings.map(({ key, value }) => [key.name, value]), rules: parsed.rules };
	await container.redis.set(getPendingKey(guildId, ownerId, importId), JSON.stringify(stored), 'EX', PendingImportSeconds);
}

/**
 * Takes the import {@linkcode savePendingImport} kept, which can only be taken once: a second click, or a click on
 * another process, finds nothing.
 *
 * @returns What the file holds, or `null` when the import expired, was answered already, or holds a setting this version
 * of the bot does not carry anymore.
 */
export async function takePendingImport(guildId: Snowflake, ownerId: Snowflake, importId: Snowflake): Promise<ParsedConfiguration | null> {
	const raw = await container.redis.getdel(getPendingKey(guildId, ownerId, importId));
	if (raw === null) return null;

	const stored = JSON.parse(raw) as StoredImport;
	const settings: ParsedConfiguration['settings'] = [];
	for (const [name, value] of stored.settings) {
		const key = findPortableKey(name);
		if (key === null) return null;

		settings.push({ key, value });
	}

	return { settings, rules: stored.rules };
}
