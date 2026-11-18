import { codeBlock, EmbedBuilder } from '@discordjs/builders';
import { DiscordAPIError, HTTPError } from '@discordjs/rest';
import { ResultError } from '@sapphire/result';
import { cutText } from '@sapphire/utilities';
import { container, UserError, type ClientEventCommandContext } from '@wolfstar/http-framework';
import { envParseString } from '@wolfstar/env-utilities';
import {
	ApplicationCommandOptionType,
	ApplicationCommandType,
	type APIApplicationCommandInteractionDataOption,
	type APIApplicationCommandInteraction
} from 'discord-api-types/v10';
import { Colors } from '#utils/constants';

/**
 * The webhook the unexpected errors of the commands are sent to, from `WEBHOOK_ERROR_ID` and `WEBHOOK_ERROR_TOKEN`, or
 * `null` when either is not set.
 */
export function getErrorWebhook(): { id: string; token: string } | null {
	const id = envParseString('WEBHOOK_ERROR_ID', '');
	const token = envParseString('WEBHOOK_ERROR_TOKEN', '');
	return id && token ? { id, token } : null;
}

/**
 * Whether an error of a command is a bug worth reporting: not a string nor a `UserError`, which the user is answered
 * with, nor an aborted request, which the user is told to try again.
 */
export function isReportableCommandError(error: unknown): boolean {
	if (error instanceof ResultError) return isReportableCommandError(error.value);
	if (typeof error === 'string' || error instanceof UserError) return false;
	return !(error instanceof Error && error.name === 'AbortError');
}

/**
 * Sends an unexpected error of a command to the error webhook, as the bot did before V7. Does nothing when the webhook
 * is not set or the error is not a bug, and only logs a failure, without the error: the URL of the request holds the
 * token of the webhook.
 */
export async function reportCommandErrorToWebhook(error: unknown, context: ClientEventCommandContext): Promise<void> {
	const webhook = getErrorWebhook();
	if (webhook === null || !isReportableCommandError(error)) return;

	try {
		const embed = new EmbedBuilder().setColor(Colors.Red).setDescription(formatCommandErrorReport(error, context.interaction)).setTimestamp();
		await container.gatewayClient.webhooks.send(webhook.id, webhook.token, { embeds: [embed.toJSON()] });
	} catch (sendError) {
		const reason = sendError instanceof DiscordAPIError ? `${sendError.code} (${sendError.status})` : String((sendError as Error)?.name);
		container.logger.warn(`[ERROR WEBHOOK] Could not report an error: ${reason}`);
	}
}

/**
 * The description of the embed of an error: where it happened, the command and its options, the request to Discord
 * that failed when it is one, and the stack. An embed description holds 4096 characters, the stack is cut to fit.
 */
export function formatCommandErrorReport(error: unknown, interaction: APIApplicationCommandInteraction): string {
	const lines = [getLocationLine(interaction), `**Command**: ${getCommandLine(interaction)}`];
	if (error instanceof DiscordAPIError || error instanceof HTTPError) {
		lines.push(`**Path**: ${error.method.toUpperCase()} ${error.url}`);
		lines.push(`**Code**: ${error instanceof DiscordAPIError ? error.code : error.status}`);
	}

	const head = lines.join('\n');
	const stack = error instanceof Error ? error.stack || error.message : String(error);
	// 4096 minus the head, the label and the fences of the code block:
	const room = 4096 - head.length - '\n**Error**: '.length - '```js\n\n```'.length;
	return `${head}\n**Error**: ${codeBlock('js', cutText(stack, Math.max(room, 0)))}`;
}

function getLocationLine(interaction: APIApplicationCommandInteraction): string {
	const user = interaction.member?.user ?? interaction.user;
	const where = interaction.guild_id
		? `${interaction.guild_id}/${interaction.channel?.id ?? 'unknown'}`
		: `DM/${interaction.channel?.id ?? 'unknown'}`;
	return `**Where**: ${where} | **User**: ${user ? `${user.id}` : 'unknown'}`;
}

function getCommandLine(interaction: APIApplicationCommandInteraction): string {
	const { data } = interaction;
	if (data.type !== ApplicationCommandType.ChatInput) {
		return `\`${data.name}\`${'target_id' in data ? ` (target ${data.target_id})` : ''}`;
	}

	const parts = [data.name];
	const options = flattenOptions(data.options ?? [], parts);
	const command = `/${parts.join(' ')}`;
	const text = options.length === 0 ? command : `${command} ${options.join(' ')}`;
	return `\`${cutText(text.replaceAll('`', '῾'), 1000)}\``;
}

/**
 * Adds the names of the subcommand group and the subcommand to `path` and returns the other options as `name:value`.
 */
function flattenOptions(options: readonly APIApplicationCommandInteractionDataOption[], path: string[]): string[] {
	const result: string[] = [];
	for (const option of options) {
		if (option.type === ApplicationCommandOptionType.SubcommandGroup || option.type === ApplicationCommandOptionType.Subcommand) {
			path.push(option.name);
			result.push(...flattenOptions(option.options ?? [], path));
		} else {
			result.push(`${option.name}:${JSON.stringify(option.value)}`);
		}
	}

	return result;
}
