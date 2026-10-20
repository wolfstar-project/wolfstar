import { encodeAutoMessageModalId, type AutoMessageModalAction } from '#lib/automessages/ids';
import type { Translator } from '#lib/structures/commands/utils';
import { cutText } from '@sapphire/utilities';
import { ComponentType, TextInputStyle, type APIModalInteractionResponseCallbackData } from 'discord-api-types/v10';
import { MaximumAutoMessageLength } from 'wolfstar-database';

export const AutoMessageRoot = 'commands/auto-messages';

/**
 * The custom ID of the text input of the modal of `/automessage enable`.
 */
export const AutoMessageContentInputId = 'content';

/**
 * The modal `/automessage enable` asks for the text of the message in, which can have several lines where an option of
 * a command cannot.
 *
 * @param t - The function to translate with, in the language of the administrator.
 * @param action - What the command was given.
 * @param content - The text the channel sends already, to edit it.
 */
export function renderAutoMessageModal(
	t: Translator,
	action: AutoMessageModalAction,
	content: string | null
): APIModalInteractionResponseCallbackData {
	return {
		custom_id: encodeAutoMessageModalId(action),
		title: cutText(t(`${AutoMessageRoot}:modalTitle`), 45),
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.TextInput,
						custom_id: AutoMessageContentInputId,
						label: cutText(t(`${AutoMessageRoot}:modalContentLabel`), 45),
						style: TextInputStyle.Paragraph,
						required: true,
						max_length: MaximumAutoMessageLength,
						...(content === null ? {} : { value: content })
					}
				]
			}
		]
	};
}
