import { container, type ClientEventCommandContext } from '@wolfstar/http-framework';
import { ApplicationCommandOptionType, ApplicationCommandType, type APIApplicationCommandInteraction } from 'discord-api-types/v10';
import { randomUUID } from 'node:crypto';
import type { Models } from 'wolfstar-database';

type TimestampString = Models.public_CommandLog['executedAt'];

export interface CommandLogPayload {
	guildId: string | null;
	userId: string;
	commandName: string;
	commandType: string;
	commandId?: string | null;
	subcommand?: string | null;
	channelId?: string | null;
	success?: boolean;
	errorReason?: string | null;
	latencyMs?: number | null;
}

/**
 * When the commands that are running started, by the context the framework emits their events with.
 */
const startTimes = new WeakMap<ClientEventCommandContext, number>();

/**
 * Records when a command started running, the framework does not measure it.
 *
 * @param context - The context `commandRun` was emitted with.
 */
export function trackCommandStart(context: ClientEventCommandContext): void {
	startTimes.set(context, performance.now());
}

/**
 * Gets how long a command ran for, in milliseconds, or `undefined` when its start was not recorded.
 *
 * @param context - The context `commandSuccess` or `commandError` was emitted with.
 */
export function getCommandDuration(context: ClientEventCommandContext): number | undefined {
	const start = startTimes.get(context);
	return start === undefined ? undefined : performance.now() - start;
}

export function normalizeCommandError(err: unknown): string | null {
	if (err === null || err === undefined) return null;
	if (err instanceof Error) return err.message.slice(0, 2000);
	if (typeof err === 'string') return err.slice(0, 2000);
	try {
		return JSON.stringify(err).slice(0, 2000);
	} catch {
		return String(err).slice(0, 2000);
	}
}

/**
 * Gets the name of the subcommand a chat input interaction ran, without its group, or `null` if it has none.
 *
 * @param interaction - The interaction to read the options of.
 */
export function getSubcommandName(interaction: APIApplicationCommandInteraction): string | null {
	if (interaction.data.type !== ApplicationCommandType.ChatInput) return null;

	const [option] = interaction.data.options ?? [];
	if (option?.type === ApplicationCommandOptionType.Subcommand) return option.name;
	if (option?.type === ApplicationCommandOptionType.SubcommandGroup) return option.options[0]?.name ?? null;
	return null;
}

/**
 * Gets the name of the subcommand group a chat input interaction ran, or `null` if it has none.
 *
 * @param interaction - The interaction to read the options of.
 */
export function getSubcommandGroupName(interaction: APIApplicationCommandInteraction): string | null {
	if (interaction.data.type !== ApplicationCommandType.ChatInput) return null;

	const [option] = interaction.data.options ?? [];
	return option?.type === ApplicationCommandOptionType.SubcommandGroup ? option.name : null;
}

/**
 * Builds the row of a command that finished from the context of its event.
 *
 * @param context - The context `commandSuccess` or `commandError` was emitted with.
 * @param success - Whether the command succeeded.
 * @param error - What the command threw, when it failed.
 */
export function makeCommandLogPayload(context: ClientEventCommandContext, success: boolean, error?: unknown): CommandLogPayload {
	const { interaction } = context;
	const duration = getCommandDuration(context);

	return {
		guildId: interaction.guild_id ?? null,
		userId: (interaction.member?.user ?? interaction.user)!.id,
		commandName: interaction.data.name,
		commandType: interaction.data.type === ApplicationCommandType.ChatInput ? 'CHAT_INPUT' : 'CONTEXT_MENU',
		commandId: interaction.data.id,
		subcommand: getSubcommandName(interaction),
		channelId: interaction.channel.id,
		success,
		errorReason: success ? null : normalizeCommandError(error),
		latencyMs: duration === undefined ? null : Math.round(duration)
	};
}

export function writeCommandLog(payload: CommandLogPayload): void {
	if (payload.guildId === null) return;
	void Promise.resolve(
		container.prisma.orm.public.CommandLog.create({
			id: randomUUID(),
			guildId: BigInt(payload.guildId),
			userId: BigInt(payload.userId),
			commandName: payload.commandName,
			commandType: payload.commandType,
			commandId: payload.commandId ? BigInt(payload.commandId) : null,
			subcommand: payload.subcommand ?? null,
			channelId: payload.channelId ? BigInt(payload.channelId) : null,
			success: payload.success ?? true,
			errorReason: payload.errorReason ?? null,
			executedAt: new Date().toISOString() as TimestampString,
			latencyMs: payload.latencyMs ?? null,
			metadata: null
		})
	).catch(() => null);
}
