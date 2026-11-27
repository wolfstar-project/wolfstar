import { encodeOnboardingVerifyId } from '#lib/onboarding/ids';
import { getOnboardingEmojiChallenge } from '#lib/onboarding/flow';
import { OnboardingEventsRoot } from '#lib/onboarding/log';
import type { TranslationKey, Translator } from '#lib/structures/commands/utils';
import { Colors } from '#utils/constants';
import { getWebsiteUrl } from '#utils/website';
import { cutText } from '@sapphire/utilities';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import {
	ButtonStyle,
	ComponentType,
	MessageFlags,
	TextInputStyle,
	type APIInteractionResponseCallbackData,
	type APIModalInteractionResponseCallbackData,
	type RESTPostAPIChannelMessageJSONBody,
	type Snowflake
} from 'discord-api-types/v10';
import { MaximumOnboardingAnswerLength, type OnboardingStage, type OnboardingVerification } from 'wolfstar-database';

const Root = OnboardingEventsRoot;

/**
 * The custom ID of the text input of the modal of a `Question` stage.
 */
export const OnboardingAnswerInputId = 'answer';

/**
 * Builds the verification message the bot posts in the guild: what to do, and the button every stage starts from.
 *
 * @param t - The function to translate with, in the language of the guild.
 * @param guildId - The guild.
 */
export function renderOnboardingMessage(t: TFunction<AnyNamespace>, guildId: Snowflake) {
	return {
		components: [
			{
				type: ComponentType.Container,
				accent_color: Colors.Green,
				components: [{ type: ComponentType.TextDisplay, content: `## ${t(`${Root}:messageTitle`)}\n${t(`${Root}:messageDescription`)}` }]
			},
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.Button,
						style: ButtonStyle.Success,
						label: t(`${Root}:messageButton`),
						custom_id: encodeOnboardingVerifyId({ verb: 'start', guildId })
					}
				]
			}
		],
		flags: MessageFlags.IsComponentsV2,
		allowed_mentions: { parse: [] }
	} satisfies RESTPostAPIChannelMessageJSONBody;
}

/**
 * Builds the private answer of an `Emoji` stage: the emoji the member is asked for, and the buttons to pick it from.
 *
 * @param t - The function to translate with, in the language of the member.
 * @param stage - The stage.
 * @param verification - The member's row, whose attempts pick the emojis.
 * @param notice - A line above the challenge, such as the attempts left after a wrong answer.
 */
export function renderOnboardingEmojiChallenge(
	t: Translator,
	stage: OnboardingStage,
	verification: Pick<OnboardingVerification, 'id' | 'attempts'>,
	notice: string | null = null
): APIInteractionResponseCallbackData {
	const { target, options } = getOnboardingEmojiChallenge(verification.id, verification.attempts);
	const asked = options[target]!;
	const text = [
		`### ${stage.name}`,
		...(notice === null ? [] : [notice]),
		t(`${Root}:emojiPrompt`, { name: t(`${Root}:emoji${capitalize(asked.name)}` as TranslationKey) })
	].join('\n');

	return {
		components: [
			{ type: ComponentType.Container, accent_color: Colors.Blue, components: [{ type: ComponentType.TextDisplay, content: text }] },
			{
				type: ComponentType.ActionRow,
				components: options.map((option, index) => ({
					type: ComponentType.Button,
					style: ButtonStyle.Secondary,
					emoji: { name: option.emoji },
					custom_id: encodeOnboardingVerifyId({ verb: 'emoji', verificationId: verification.id, attempts: verification.attempts, index })
				}))
			}
		],
		flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
		allowed_mentions: { parse: [] }
	};
}

function capitalize(text: string) {
	return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/**
 * Builds the modal of a `Question` stage: the whole question as text, and the input of the answer.
 */
export function renderOnboardingQuestionModal(
	t: Translator,
	stage: OnboardingStage,
	verification: Pick<OnboardingVerification, 'id' | 'attempts'>
): APIModalInteractionResponseCallbackData {
	return {
		custom_id: encodeOnboardingVerifyId({ verb: 'answer', verificationId: verification.id, attempts: verification.attempts }),
		title: cutText(stage.name, 45),
		components: [
			{ type: ComponentType.TextDisplay, content: stage.question ?? '' },
			{
				type: ComponentType.Label,
				label: cutText(t(`${Root}:questionLabel`), 45),
				component: {
					type: ComponentType.TextInput,
					custom_id: OnboardingAnswerInputId,
					style: TextInputStyle.Short,
					required: true,
					max_length: MaximumOnboardingAnswerLength
				}
			}
		]
	};
}

/**
 * A button under a private answer of the members' side: `Continue` to the next stage or `Answer again` (an action of
 * the bot), or the link to the captcha of a `Captcha` stage on the website.
 */
export type OnboardingNoticeButton =
	| { readonly kind: 'Action'; readonly label: string; readonly customId: string }
	| { readonly kind: 'Link'; readonly label: string; readonly url: string };

/**
 * The page of the website where a member passes the captcha of a `Captcha` stage of a guild. The page of the join
 * guard's checkpoint is the same: it shows what the member waits for.
 */
export function getOnboardingCaptchaUrl(guildId: Snowflake) {
	return `${getWebsiteUrl()}/verify/${guildId}`;
}

function renderNoticeButton(button: OnboardingNoticeButton) {
	const label = cutText(button.label, 80);
	return button.kind === 'Link'
		? { type: ComponentType.Button as const, style: ButtonStyle.Link as const, label, url: button.url }
		: { type: ComponentType.Button as const, style: ButtonStyle.Primary as const, label, custom_id: button.customId };
}

/**
 * Builds a private answer of the members' side: a line of text, with a button when there is something to do next.
 */
export function renderOnboardingNotice(content: string, button: OnboardingNoticeButton | null = null) {
	return {
		content,
		components:
			button === null
				? []
				: [
						{
							type: ComponentType.ActionRow,
							components: [renderNoticeButton(button)]
						}
					],
		flags: MessageFlags.Ephemeral,
		allowed_mentions: { parse: [] }
	} satisfies APIInteractionResponseCallbackData;
}

/**
 * Builds what the private answer of an `Emoji` stage becomes once it is over: a message of components stays one, so
 * the text is in a container.
 */
export function renderOnboardingNoticeUpdate(content: string, button: OnboardingNoticeButton | null = null): APIInteractionResponseCallbackData {
	return {
		components: [
			{ type: ComponentType.Container, components: [{ type: ComponentType.TextDisplay, content }] },
			...(button === null
				? []
				: [
						{
							type: ComponentType.ActionRow as const,
							components: [renderNoticeButton(button)]
						}
					])
		],
		flags: MessageFlags.IsComponentsV2,
		allowed_mentions: { parse: [] }
	};
}
