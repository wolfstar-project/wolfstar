import { LanguageKeys } from '#lib/i18n/languageKeys';
import { EmbedBuilder } from '@discordjs/builders';
import type { TFunction } from '@sapphire/plugin-i18next';
import { cutText } from '@sapphire/utilities';
import { Colors, chatInputApplicationCommandMention } from 'discord.js';
import { auditDiff } from 'evlog';

export interface CommandExecutePayload {
	actorId: string;
	commandName: string;
	commandId?: string;
	commandType: 'chat-input' | 'context-menu' | 'message';
	channelId: string;
	timestamp: Date;
}

export type AuditLogSettingsAction = 'guild.settings.update' | 'guild.settings.add' | 'guild.settings.remove' | 'guild.settings.access-denied';

export interface SettingsChangePayload {
	actorId: string;
	action: AuditLogSettingsAction;
	before: Record<string, unknown>;
	after: Record<string, unknown>;
	reason: string | null;
	timestamp: Date;
}

function formatChatInputMention(commandName: string, commandId?: string): string {
	const parts = commandName.split(' ');
	if (!commandId) return `\`/${commandName}\``;
	if (parts.length === 3) return chatInputApplicationCommandMention(parts[0], parts[1], parts[2], commandId);
	if (parts.length === 2) return chatInputApplicationCommandMention(parts[0], parts[1], commandId);
	return chatInputApplicationCommandMention(parts[0], commandId);
}

export function buildCommandExecuteEmbed(t: TFunction, payload: CommandExecutePayload): EmbedBuilder {
	const { actorId, commandName, commandId, commandType, channelId, timestamp } = payload;
	const formattedCommandName = commandType === 'chat-input' ? formatChatInputMention(commandName, commandId) : `\`${commandName}\``;
	return new EmbedBuilder()
		.setColor(Colors.Blue)
		.setTitle(t(LanguageKeys.Events.Guilds.Logs.CommandExecuteTitle))
		.addFields(
			{ name: t(LanguageKeys.Events.Guilds.Logs.LogFieldUser), value: `<@${actorId}>`, inline: true },
			{ name: t(LanguageKeys.Events.Guilds.Logs.LogFieldCommand), value: formattedCommandName, inline: true },
			{
				name: t(LanguageKeys.Events.Guilds.Logs.LogFieldType),
				value:
					commandType === 'chat-input'
						? t(LanguageKeys.Events.Guilds.Logs.CommandTypeChatInput)
						: commandType === 'context-menu'
							? t(LanguageKeys.Events.Guilds.Logs.CommandTypeContextMenu)
							: t(LanguageKeys.Events.Guilds.Logs.CommandTypeMessage),
				inline: true
			},
			{ name: t(LanguageKeys.Events.Guilds.Logs.LogFieldChannel), value: `<#${channelId}>`, inline: true }
		)
		.setTimestamp(timestamp);
}

export function buildSettingsChangeEmbed(t: TFunction, payload: SettingsChangePayload): EmbedBuilder {
	const { actorId, action, before, after, reason, timestamp } = payload;

	const color = action === 'guild.settings.access-denied' ? Colors.Yellow : action === 'guild.settings.remove' ? Colors.Red : Colors.Green;

	const title =
		action === 'guild.settings.access-denied'
			? t(LanguageKeys.Events.Guilds.Logs.SettingsAccessDeniedTitle)
			: t(LanguageKeys.Events.Guilds.Logs.SettingsUpdateTitle);

	const embed = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp(timestamp);

	if (reason) embed.setDescription(reason);

	const diff = auditDiff(before, after);
	const changeFields: { name: string; value: string; inline: boolean }[] = [];

	for (const op of diff.patch.slice(0, 10)) {
		const key = op.path.replace(/^\//, '').replaceAll('/', '.');
		let value: string;
		if (op.op === 'replace') {
			const from = cutText(formatAuditValue(getNestedValue(before, op.path)), 100);
			const to = cutText(formatAuditValue(op.value), 100);
			if (from === to) continue;
			value = `has changed ${from} to ${to}`;
		} else if (op.op === 'add') {
			value = cutText(formatAuditValue(op.value), 200);
		} else if (op.op === 'remove') {
			value = cutText(formatAuditValue(getNestedValue(before, op.path)), 200);
		} else {
			continue;
		}
		changeFields.push({ name: key, value, inline: false });
	}

	if (changeFields.length > 0) {
		embed.addFields({ name: t(LanguageKeys.Events.Guilds.Logs.LogFieldUser), value: `<@${actorId}>`, inline: true }, ...changeFields);
	} else {
		embed.addFields({ name: t(LanguageKeys.Events.Guilds.Logs.LogFieldUser), value: `<@${actorId}>`, inline: true });
	}

	return embed;
}

function formatAuditValue(value: unknown): string {
	if (value === null || value === undefined) return '`null`';
	if (typeof value === 'string') return value.length === 0 ? '""' : value;
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
	return '`' + JSON.stringify(value) + '`';
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
	const parts = path.split('/').filter(Boolean);
	let current: unknown = obj;
	for (const part of parts) {
		if (current === null || current === undefined || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}
