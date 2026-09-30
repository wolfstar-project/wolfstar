import { floatPromise, minutes, resolveOnErrorCodes } from '#utils/common';
import type { MessageResponseOptions, PartialMessage } from '@wolfstar/http-framework';
import type { Message } from '@wolfstar/plugin-gateway';
import {
	ButtonStyle,
	ComponentType,
	RESTJSONErrorCodes,
	type APIActionRowComponent,
	type APIButtonComponentWithCustomId,
	type Snowflake
} from 'discord-api-types/v10';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Anything that can be answered with a message, such as a slash command interaction.
 */
export interface MessageReplier {
	/** The user that invoked the interaction. */
	readonly user: { readonly id: Snowflake };
	reply(data: MessageResponseOptions): Promise<PartialMessage>;
}

/**
 * Deletes a message, skipping if it was already deleted, and aborting if a non-zero timer was set and the message was
 * either deleted or edited.
 *
 * This also ignores the `UnknownMessage` error code.
 * @param message The message to delete, either a gateway message or the response of an interaction.
 * @param time The amount of time, defaults to 0.
 * @returns The deleted message.
 */
export async function deleteMessage<T extends Message | PartialMessage>(message: T, time = 0): Promise<T> {
	if (time === 0) return deleteMessageImmediately(message);

	// Interaction responses have no edit tracking, only gateway messages can be checked:
	const lastEditedTimestamp = isGatewayMessage(message) ? message.editedTimestamp : null;
	await sleep(time);

	// If it was edited, cancel:
	if (isGatewayMessage(message) && message.editedTimestamp !== lastEditedTimestamp) return message;

	return deleteMessageImmediately(message);
}

function isGatewayMessage(message: Message | PartialMessage): message is Message {
	return 'editedTimestamp' in message;
}

async function deleteMessageImmediately<T extends Message | PartialMessage>(message: T): Promise<T> {
	// The response of an interaction resolves to a result instead of throwing:
	if (!isGatewayMessage(message)) {
		await message.delete();
		return message;
	}

	await resolveOnErrorCodes(message.delete(), RESTJSONErrorCodes.UnknownMessage);
	return message;
}

/**
 * Replies to an interaction with a temporary message and then floats a {@link deleteMessage} with the given `timer`.
 *
 * This is the interaction-based counterpart of `sendTemporaryMessage(message, options, timer)`.
 * @param interaction The interaction to reply to.
 * @param options The options of the reply.
 * @param timer The timer in which the message should be deleted, using {@link deleteMessage}.
 * @returns The response message.
 */
export async function sendTemporaryMessage(
	interaction: MessageReplier,
	options: string | MessageResponseOptions,
	timer = minutes(1)
): Promise<PartialMessage> {
	if (typeof options === 'string') options = { content: options };

	const response = await interaction.reply(options);
	floatPromise(deleteMessage(response, timer));
	return response;
}

/**
 * The prompt confirmation options.
 */
export interface PromptConfirmationOptions {
	/**
	 * The user allowed to answer.
	 * @default interaction.user.id
	 */
	target?: Snowflake;

	/**
	 * The time for the confirmation to run, in milliseconds.
	 * @default minutes(1)
	 */
	time?: number;

	/**
	 * The label of the button confirming the prompt.
	 * @default 'Yes'
	 */
	yesLabel?: string;

	/**
	 * The label of the button declining the prompt.
	 * @default 'No'
	 */
	noLabel?: string;
}

export interface ConfirmationPrompt {
	/** The custom id shared by both buttons, before the answer, use {@link answerConfirmationPrompt} to resolve it. */
	readonly id: string;

	/** The action row holding the confirmation buttons, to be sent with the message. */
	readonly components: [APIActionRowComponent<APIButtonComponentWithCustomId>];

	/**
	 * Resolves once the target answers: `true` for yes, `false` for no, or `null` if the time ran out.
	 */
	wait(): Promise<boolean | null>;
}

/**
 * The prefix of the custom ids of the confirmation buttons, `<prefix>:<prompt id>:<yes|no>`.
 */
export const ConfirmationCustomIdPrefix = 'wolfstar-confirm';

interface PendingConfirmation {
	readonly target: Snowflake;
	resolve(value: boolean | null): void;
}

const pendingConfirmations = new Map<string, PendingConfirmation>();

/**
 * Creates the buttons of a confirmation prompt, without sending anything. The caller sends `components` with its own
 * response, then awaits {@link ConfirmationPrompt.wait}.
 *
 * Discord delivers the clicks as new interactions, they must be forwarded to {@link answerConfirmationPrompt} by a
 * component interaction handler.
 * @param options The prompt options.
 */
export function createConfirmationPrompt(options: PromptConfirmationOptions & { target: Snowflake }): ConfirmationPrompt {
	const id = randomUUID();
	const button = (answer: 'yes' | 'no', label: string, style: ButtonStyle.Success | ButtonStyle.Danger): APIButtonComponentWithCustomId => ({
		type: ComponentType.Button,
		custom_id: `${ConfirmationCustomIdPrefix}:${id}:${answer}`,
		label,
		style
	});

	return {
		id,
		components: [
			{
				type: ComponentType.ActionRow,
				components: [button('yes', options.yesLabel ?? 'Yes', ButtonStyle.Success), button('no', options.noLabel ?? 'No', ButtonStyle.Danger)]
			}
		],
		wait() {
			return new Promise<boolean | null>((resolve) => {
				const timer = setTimeout(
					() => {
						pendingConfirmations.delete(id);
						resolve(null);
					},
					options.time ?? minutes(1)
				).unref();

				pendingConfirmations.set(id, {
					target: options.target,
					resolve: (value) => {
						clearTimeout(timer);
						pendingConfirmations.delete(id);
						resolve(value);
					}
				});
			});
		}
	};
}

export const enum ConfirmationAnswer {
	/** The custom id does not belong to a pending prompt, because it was already answered or timed out. */
	Expired,
	/** The user is not the target of the prompt. */
	Forbidden,
	/** The prompt was answered, its waiter has been resolved. */
	Answered
}

/**
 * Forwards the click of a confirmation button to its prompt.
 * @param customId The custom id of the button that was clicked.
 * @param userId The id of the user that clicked it.
 * @returns `null` if the custom id is not one of a confirmation button, otherwise the result of the answer.
 */
export function answerConfirmationPrompt(customId: string, userId: Snowflake): ConfirmationAnswer | null {
	const [prefix, id, answer] = customId.split(':');
	if (prefix !== ConfirmationCustomIdPrefix || (answer !== 'yes' && answer !== 'no')) return null;

	const pending = pendingConfirmations.get(id);
	if (pending === undefined) return ConfirmationAnswer.Expired;
	if (pending.target !== userId) return ConfirmationAnswer.Forbidden;

	pending.resolve(answer === 'yes');
	return ConfirmationAnswer.Answered;
}

/**
 * Replies to an interaction with a boolean confirmation prompt asking the `target` for either of two choices.
 *
 * This is the interaction-based counterpart of `promptConfirmation(message, options)`, and needs the component
 * interaction handler forwarding the clicks to {@link answerConfirmationPrompt}.
 * @param interaction The interaction to reply to.
 * @param content The content of the reply, or its options, alongside the prompt options.
 * @returns `null` if no response was given within the requested time, `boolean` otherwise.
 */
export async function promptConfirmation(
	interaction: MessageReplier,
	content: string | (Omit<MessageResponseOptions, 'components'> & PromptConfirmationOptions)
) {
	const { target, time, yesLabel, noLabel, ...reply } = typeof content === 'string' ? ({ content } as Exclude<typeof content, string>) : content;
	const prompt = createConfirmationPrompt({ target: target ?? interaction.user.id, time, yesLabel, noLabel });

	await interaction.reply({ ...reply, components: prompt.components });
	return prompt.wait();
}

interface PendingMessagePrompt {
	readonly channelId: string;
	readonly userId: Snowflake;
	resolve(content: string | null): void;
}

const pendingMessagePrompts = new Set<PendingMessagePrompt>();

/**
 * Forwards a received message to the pending {@link promptForMessage} calls, to be called for every message received
 * through the gateway.
 * @param message The message that was received.
 * @returns Whether the message answered a prompt.
 */
export function feedMessagePrompts(message: Message): boolean {
	let answered = false;
	for (const prompt of pendingMessagePrompts) {
		if (prompt.channelId !== message.channelId || prompt.userId !== message.author.id) continue;

		prompt.resolve(message.content);
		answered = true;
	}

	return answered;
}

/**
 * Replies to an interaction asking for a text, and waits for the next message of the same user in the same channel.
 *
 * This is the interaction-based counterpart of `promptForMessage(message, sendOptions, time)`, and needs the
 * `messageCreate` listener forwarding the messages to {@link feedMessagePrompts}.
 * @param interaction The interaction to reply to.
 * @param channelId The channel to listen to.
 * @param sendOptions The content of the reply, or its options.
 * @param time The time to wait for an answer, in milliseconds.
 * @returns The content of the message, or `null` if no message was received within the requested time.
 */
export async function promptForMessage(
	interaction: MessageReplier,
	channelId: Snowflake,
	sendOptions: string | MessageResponseOptions,
	time = minutes(1)
): Promise<string | null> {
	if (typeof sendOptions === 'string') sendOptions = { content: sendOptions };

	const response = await interaction.reply(sendOptions);
	const result = await new Promise<string | null>((resolve) => {
		const prompt: PendingMessagePrompt = {
			channelId,
			userId: interaction.user.id,
			resolve: (content) => {
				clearTimeout(timer);
				pendingMessagePrompts.delete(prompt);
				resolve(content);
			}
		};
		const timer = setTimeout(() => prompt.resolve(null), time).unref();
		pendingMessagePrompts.add(prompt);
	});

	floatPromise(deleteMessage(response));
	return result;
}
