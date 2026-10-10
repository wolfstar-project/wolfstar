import type { Translator } from '#lib/structures/commands/utils';
import type { TypeVariation } from '#utils/moderationConstants';
import { cutText } from '@sapphire/utilities';
import { decodeCustomIdContent, encodeCustomId } from '@wolfstar/http-framework-utilities';
import { ButtonStyle, ComponentType, type APIInteractionResponseCallbackData, type Snowflake } from 'discord-api-types/v10';

/**
 * The name of the interaction handler of the prompt that sets up a role, which is also the first part of its custom IDs.
 */
export const RoleSetupHandlerName = 'roleSetup';

/**
 * What a component of the prompt does:
 *
 * - `existing`: the select menu of the roles, the role that is picked becomes the role of the action.
 * - `create`: creates a new role and configures it in every channel.
 * - `cancel`: closes the prompt and sets nothing up.
 */
export type RoleSetupVerb = 'existing' | 'create' | 'cancel';

export interface RoleSetupAction {
	/**
	 * The administrator who ran the command, the only one that can answer the prompt.
	 */
	ownerId: Snowflake;
	verb: RoleSetupVerb;

	/**
	 * The type of the moderation action the role is of, such as a mute.
	 */
	type: TypeVariation;
}

/**
 * Builds the custom ID of a component of the prompt, `roleSetup.<ownerId>.<verb>:<type>`.
 *
 * @remarks Everything a click needs is in the ID, so the prompt keeps working after a restart and on any process.
 */
export function encodeRoleSetupId(action: RoleSetupAction) {
	return encodeCustomId(RoleSetupHandlerName, action.ownerId, `${action.verb}:${action.type}`);
}

const Verbs = new Set<string>(['existing', 'create', 'cancel']);

/**
 * Reads what {@linkcode encodeRoleSetupId} wrote from the content the framework parsed out of a custom ID.
 *
 * @returns The action, or `null` when the custom ID is not one of the prompt.
 */
export function decodeRoleSetupId(content: unknown): RoleSetupAction | null {
	const decoded = decodeCustomIdContent(content);
	if (decoded === null) return null;

	const [verb, type] = decoded.action.split(':');
	if (verb === undefined || !Verbs.has(verb) || type === undefined) return null;

	const typeNumber = Number(type);
	if (!Number.isSafeInteger(typeNumber) || typeNumber < 0) return null;

	return { ownerId: decoded.sessionId, verb: verb as RoleSetupVerb, type: typeNumber as TypeVariation };
}

/**
 * The body of the prompt: a line of text and its components.
 */
export type RoleSetupMessage = Pick<APIInteractionResponseCallbackData, 'content' | 'components' | 'allowed_mentions'>;

/**
 * Renders the prompt an administrator gets when a moderation command needs a role that is not set up: a select menu
 * to use a role the server has, a button to create a new one, and one to cancel.
 *
 * @param t - The function to translate with, in the language of the administrator.
 * @param ownerId - The administrator who ran the command.
 * @param type - The type of the moderation action the role is of.
 */
export function renderRoleSetupPrompt(t: Translator, ownerId: Snowflake, type: TypeVariation): RoleSetupMessage {
	const id = (verb: RoleSetupVerb) => encodeRoleSetupId({ ownerId, verb, type });
	return {
		content: t('moderationActions:sharedRoleSetupPrompt'),
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.RoleSelect,
						custom_id: id('existing'),
						placeholder: cutText(t('moderationActions:sharedRoleSetupPickPlaceholder'), 150),
						min_values: 1,
						max_values: 1
					}
				]
			},
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.Button,
						custom_id: id('create'),
						style: ButtonStyle.Primary,
						label: cutText(t('moderationActions:sharedRoleSetupCreate'), 80)
					},
					{
						type: ComponentType.Button,
						custom_id: id('cancel'),
						style: ButtonStyle.Secondary,
						label: cutText(t('moderationActions:sharedRoleSetupCancel'), 80)
					}
				]
			}
		],
		allowed_mentions: { parse: [] }
	};
}

/**
 * What a moderation command throws from `inhibit` to answer with a prompt and not with a failure, see
 * `ModerationCommand#chatInputRun`.
 */
export class ModerationCommandPrompt {
	public constructor(public readonly message: RoleSetupMessage) {}
}
