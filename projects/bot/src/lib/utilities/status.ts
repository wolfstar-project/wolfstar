import { Colors } from '#utils/constants';
import { Emojis, type EmojiKey } from '#utils/emojis';
import { ComponentType, MessageFlags, type APIContainerComponent, type APIInteractionResponseCallbackData } from 'discord-api-types/v10';

/**
 * What a status message tells: something to know, something that worked, something to watch out for, or something that
 * did not work.
 */
export type StatusKind = 'info' | 'success' | 'warning' | 'error';

const StatusEmojis = {
	info: 'Info',
	success: 'GreenTick',
	warning: 'Warning',
	error: 'RedCross'
} as const satisfies Record<StatusKind, EmojiKey>;

/**
 * The colour of the bar of each kind. An information has none, it is not an outcome.
 */
const StatusColors = {
	info: null,
	success: Colors.Green,
	warning: Colors.Yellow,
	error: Colors.Red
} as const satisfies Record<StatusKind, Colors | null>;

/**
 * The body of a status message, which is made of components only.
 */
export type StatusMessage = Pick<APIInteractionResponseCallbackData, 'allowed_mentions' | 'flags'> & { components: [APIContainerComponent] };

/**
 * How a status message looks, when it is not the default of its kind.
 */
export interface StatusLook {
	/**
	 * The emoji in front of the text, written as in a message, in place of the one of the kind. A moderation action shows
	 * the emoji of its type.
	 */
	emoji?: string;
	/**
	 * Whether the container has the bar of the colour of its kind, `true` by default. A moderation action that worked has
	 * none, as the answers of Flamey.
	 */
	accent?: boolean;
}

export interface StatusOptions extends StatusLook {
	/**
	 * Whether only the user who is answered sees the message, `true` by default.
	 */
	ephemeral?: boolean;
}

/**
 * The container of a status message: the emoji of its kind and its text, with the bar of its colour.
 *
 * @param kind - What the message tells.
 * @param text - The text, already translated.
 * @param look - Another emoji, or no bar.
 */
export function renderStatusContainer(kind: StatusKind, text: string, look: StatusLook = {}): APIContainerComponent {
	const color = look.accent === false ? null : StatusColors[kind];
	return {
		type: ComponentType.Container,
		...(color === null ? {} : { accent_color: color }),
		components: [{ type: ComponentType.TextDisplay, content: `${look.emoji ?? Emojis[StatusEmojis[kind]]} ${text}` }]
	};
}

/**
 * What the bot answers with to tell an outcome: one container, the same shape for every command.
 *
 * @remarks It pings nobody. A message that was sent with components only cannot get a `content` nor an embed later, so
 * what edits a status message gives it another one.
 *
 * @param kind - What the message tells.
 * @param text - The text, already translated.
 * @param options - Whether the message is ephemeral, and how it looks.
 */
export function renderStatus(kind: StatusKind, text: string, options: StatusOptions = {}): StatusMessage {
	const ephemeral = options.ephemeral ?? true;
	return {
		components: [renderStatusContainer(kind, text, options)],
		flags: ephemeral ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.IsComponentsV2,
		allowed_mentions: { parse: [] }
	};
}

/**
 * What takes the place of a message that was sent with a `content`, embeds or its own components, such as a prompt,
 * when its outcome is told in the same message.
 *
 * @remarks A message of components only holds neither a `content` nor an embed, so both are emptied with the edit.
 * Whether the message is ephemeral is not changed by an edit.
 *
 * @param kind - What the message tells.
 * @param text - The text, already translated.
 */
export function renderStatusUpdate(kind: StatusKind, text: string): StatusMessage & { content: ''; embeds: [] } {
	return { ...renderStatus(kind, text, { ephemeral: false }), content: '', embeds: [] };
}
