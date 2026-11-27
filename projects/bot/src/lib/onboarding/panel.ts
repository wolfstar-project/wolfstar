import { encodeOnboardingPanelId, formatOnboardingToggleTarget, type OnboardingPanelAction, type OnboardingPanelVerb } from '#lib/onboarding/ids';
import { getOnboardingStageBlockers, type OnboardingReadinessContext, type OnboardingStageBlocker } from '#lib/onboarding/readiness';
import type { TranslationKey, Translator } from '#lib/structures/commands/utils';
import { Colors } from '#utils/constants';
import { channelMention, roleMention } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import {
	ButtonStyle,
	ChannelType,
	ComponentType,
	MessageFlags,
	SelectMenuDefaultValueType,
	SeparatorSpacingSize,
	TextInputStyle,
	type APIActionRowComponent,
	type APIComponentInMessageActionRow,
	type APIInteractionResponseCallbackData,
	type APIMessageTopLevelComponent,
	type APIModalInteractionResponseCallbackData,
	type APITextDisplayComponent,
	type Snowflake
} from 'discord-api-types/v10';
import {
	MaximumOnboardingAnswerLength,
	MaximumOnboardingAnswers,
	MaximumOnboardingQuestionLength,
	MaximumOnboardingStageNameLength,
	MaximumOnboardingStages,
	OnboardingAttemptLimits,
	OnboardingFailureTimeoutLimits,
	OnboardingTimeLimitLimits,
	normalizeOnboardingStageInput,
	type OnboardingChallenge,
	type OnboardingConfig,
	type OnboardingCounts,
	type OnboardingStage,
	type OnboardingStageInput,
	type OnboardingStageProblem
} from 'wolfstar-database';

export const OnboardingPanelRoot = 'commands/onboarding';
const Root = OnboardingPanelRoot;

/**
 * The custom IDs of the inputs of the modal of a stage.
 */
export const OnboardingStageInputs = {
	name: 'name',
	question: 'question',
	answers: 'answers',
	attempts: 'attempts',
	timeLimit: 'time-limit'
} as const;

/**
 * The failure timeouts the panel offers, in seconds: ten minutes, an hour, a day and a week.
 */
export const OnboardingFailureTimeoutChoices = [600, 3600, 86_400, 604_800] as const;

/**
 * What the panel shows next to the onboarding.
 */
export interface OnboardingPanelContext {
	readonly t: Translator;
	readonly ownerId: Snowflake;
	readonly config: OnboardingConfig;
	readonly readiness: OnboardingReadinessContext;
	readonly counts: OnboardingCounts;
	/** A line above the page, such as what was saved or why it was refused. */
	readonly notice?: string | null;
}

function id(context: Pick<OnboardingPanelContext, 'ownerId' | 'config'>, verb: OnboardingPanelVerb, stageId = '', extra = '') {
	const action: OnboardingPanelAction = { ownerId: context.ownerId, verb, revision: context.config.settings.revision, stageId, extra };
	return encodeOnboardingPanelId(action);
}

function text(content: string): APITextDisplayComponent {
	return { type: ComponentType.TextDisplay, content };
}

function row(...components: APIComponentInMessageActionRow[]): APIActionRowComponent<APIComponentInMessageActionRow> {
	return { type: ComponentType.ActionRow, components };
}

/**
 * Writes a number of seconds in the largest unit it is a whole number of: `86400` is `1d`.
 */
export function formatOnboardingSeconds(seconds: number): string {
	const units = [
		['d', 86_400],
		['h', 3600],
		['m', 60]
	] as const;
	for (const [unit, size] of units) {
		if (seconds >= size && seconds % size === 0) return `${seconds / size}${unit}`;
	}
	return `${seconds}s`;
}

/**
 * Describes what keeps a stage from working, a line each.
 */
export function describeOnboardingBlockers(t: Translator, blockers: readonly OnboardingStageBlocker[]): string {
	if (blockers.length === 0) return t(`${Root}:ready`);
	return blockers.map((blocker) => `⚠️ ${t(`${Root}:blocker${blocker}`)}`).join('\n');
}

/**
 * Describes why a stage was refused, a line each.
 */
export function describeOnboardingProblems(t: Translator, problems: readonly OnboardingStageProblem[]): string {
	const limits = {
		maximumName: MaximumOnboardingStageNameLength,
		maximumStages: MaximumOnboardingStages,
		maximumQuestion: MaximumOnboardingQuestionLength,
		maximumAnswers: MaximumOnboardingAnswers,
		maximumAnswer: MaximumOnboardingAnswerLength,
		minimumAttempts: OnboardingAttemptLimits.minimum,
		maximumAttempts: OnboardingAttemptLimits.maximum,
		minimumTimeLimit: OnboardingTimeLimitLimits.minimum / 60,
		maximumTimeLimit: OnboardingTimeLimitLimits.maximum / 60,
		minimumTimeout: formatOnboardingSeconds(OnboardingFailureTimeoutLimits.minimum),
		maximumTimeout: formatOnboardingSeconds(OnboardingFailureTimeoutLimits.maximum)
	};
	return problems.map((problem) => `⚠️ ${t(`${Root}:problem${problem}`, limits)}`).join('\n');
}

function describeFailure(t: Translator, stage: OnboardingStage): string {
	if (stage.failureAction === 'Timeout') {
		return t(`${Root}:failureTimeoutFor`, { duration: formatOnboardingSeconds(stage.failureTimeout ?? 0) });
	}
	return t(`${Root}:failure${stage.failureAction}`);
}

function describeStageLine(t: Translator, stage: OnboardingStage, index: number, readiness: OnboardingReadinessContext): string {
	const details = [t(`${Root}:trigger${stage.trigger}`), t(`${Root}:challenge${stage.challenge}`), describeFailure(t, stage)].join(' · ');
	const status = stage.enabled ? '' : ` ${t(`${Root}:stageDisabled`)}`;
	return `**${index + 1}. ${stage.name}**${status}\n-# ${details}\n${describeOnboardingBlockers(t, getOnboardingStageBlockers(stage, readiness))}`;
}

function withNotice(context: Pick<OnboardingPanelContext, 'notice'>, components: APIMessageTopLevelComponent[]) {
	return context.notice ? [text(context.notice), ...components] : components;
}

/**
 * Renders the summary of the panel: the switch, the log channel, the verification message, this week's counts and
 * every stage with what keeps it from working.
 */
export function renderOnboardingPanel(context: OnboardingPanelContext): APIInteractionResponseCallbackData {
	const { t, config, readiness, counts } = context;
	const { settings, stages } = config;
	const none = t(`${Root}:none`);
	const summary = [
		`## ${t(`${Root}:title`)}`,
		t(`${Root}:status`, { status: t(settings.enabled ? `${Root}:on` : `${Root}:off`) }),
		t(`${Root}:logChannel`, { channel: settings.logChannelId === null ? none : channelMention(settings.logChannelId) }),
		t(`${Root}:message`, {
			message: settings.channelId !== null && readiness.hasMessage ? channelMention(settings.channelId) : t(`${Root}:messageNotPosted`)
		}),
		t(`${Root}:week`, { passed: counts.passed, failed: counts.failed, waiting: counts.waiting }),
		t(`${Root}:stagesCount`, { count: stages.filter((stage) => stage.enabled).length, total: stages.length, maximum: MaximumOnboardingStages })
	].join('\n');

	const stageLines =
		stages.length === 0 ? [text(t(`${Root}:stagesNone`))] : stages.map((stage, index) => text(describeStageLine(t, stage, index, readiness)));

	const components: APIMessageTopLevelComponent[] = [
		{
			type: ComponentType.Container,
			accent_color: settings.enabled ? Colors.Green : Colors.Grey,
			components: [text(summary), { type: ComponentType.Separator, divider: true, spacing: SeparatorSpacingSize.Small }, ...stageLines]
		},
		row(
			{
				type: ComponentType.Button,
				style: settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success,
				label: t(settings.enabled ? `${Root}:disable` : `${Root}:enable`),
				custom_id: id(context, 'toggle', '', formatOnboardingToggleTarget(!settings.enabled))
			},
			{
				type: ComponentType.Button,
				style: ButtonStyle.Primary,
				label: t(`${Root}:create`),
				custom_id: id(context, 'create'),
				disabled: stages.length >= MaximumOnboardingStages
			},
			{
				type: ComponentType.Button,
				style: ButtonStyle.Secondary,
				label: t(`${Root}:logClear`),
				custom_id: id(context, 'logClear'),
				disabled: settings.logChannelId === null
			},
			{ type: ComponentType.Button, style: ButtonStyle.Secondary, label: t(`${Root}:reload`), custom_id: id(context, 'home') }
		)
	];

	if (stages.length > 0) {
		components.push(
			row({
				type: ComponentType.StringSelect,
				custom_id: id(context, 'stage'),
				placeholder: t(`${Root}:pickStage`),
				options: stages.map((stage, index) => ({ label: cutText(`${index + 1}. ${stage.name}`, 100), value: stage.id }))
			})
		);
	}

	components.push(
		row({
			type: ComponentType.ChannelSelect,
			custom_id: id(context, 'log'),
			placeholder: t(`${Root}:pickLogChannel`),
			channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
			...(settings.logChannelId === null ? {} : { default_values: [{ id: settings.logChannelId, type: SelectMenuDefaultValueType.Channel }] })
		}),
		row({
			type: ComponentType.ChannelSelect,
			custom_id: id(context, 'post'),
			placeholder: t(readiness.hasMessage ? `${Root}:pickMoveMessage` : `${Root}:pickPostMessage`),
			channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
		})
	);

	return {
		components: withNotice(context, components),
		flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
		allowed_mentions: { parse: [] }
	};
}

/**
 * Renders the page of a stage: what it is set to, what keeps it from working, and its controls.
 *
 * @param confirmDelete - Whether `Delete` was pressed once, so the next press deletes.
 */
export function renderOnboardingStagePage(
	context: OnboardingPanelContext,
	stage: OnboardingStage,
	confirmDelete = false
): APIInteractionResponseCallbackData {
	const { t, config, readiness } = context;
	const index = config.stages.findIndex((entry) => entry.id === stage.id);
	const none = t(`${Root}:none`);
	const lines = [
		`## ${index + 1}. ${stage.name}`,
		t(`${Root}:status`, { status: t(stage.enabled ? `${Root}:on` : `${Root}:off`) }),
		t(`${Root}:stageTrigger`, { value: t(`${Root}:trigger${stage.trigger}`) }),
		t(`${Root}:stageChallenge`, { value: t(`${Root}:challenge${stage.challenge}`) }),
		...(stage.challenge === 'Question'
			? [t(`${Root}:stageQuestion`, { value: stage.question ?? none }), t(`${Root}:stageAnswers`, { count: stage.answers.length })]
			: []),
		t(`${Root}:stageAttempts`, { value: stage.maxAttempts }),
		t(`${Root}:stageTimeLimit`, { value: stage.timeLimit === 0 ? none : formatOnboardingSeconds(stage.timeLimit) }),
		t(`${Root}:stageRole`, { value: stage.roleId === null ? none : roleMention(stage.roleId) }),
		t(`${Root}:stageFailure`, { value: describeFailure(t, stage) }),
		'',
		describeOnboardingBlockers(t, getOnboardingStageBlockers(stage, readiness))
	];

	const components: APIMessageTopLevelComponent[] = [
		{ type: ComponentType.Container, accent_color: stage.enabled ? Colors.Blue : Colors.Grey, components: [text(lines.join('\n'))] },
		row({
			type: ComponentType.StringSelect,
			custom_id: id(context, 'trigger', stage.id),
			options: (['Join', 'NativeOnboarding'] as const).map((trigger) => ({
				label: t(`${Root}:trigger${trigger}`),
				value: trigger,
				default: stage.trigger === trigger
			}))
		}),
		row({
			type: ComponentType.StringSelect,
			custom_id: id(context, 'challenge', stage.id),
			options: getChallengeChoices(stage, readiness.captchaAvailable).map((challenge) => ({
				label: t(`${Root}:challenge${challenge}`),
				value: challenge,
				default: stage.challenge === challenge
			}))
		}),
		row({
			type: ComponentType.StringSelect,
			custom_id: id(context, 'failure', stage.id),
			options: getFailureChoices(stage).map((choice) => ({
				label:
					choice.action === 'Timeout'
						? t(`${Root}:failureTimeoutFor`, { duration: formatOnboardingSeconds(choice.seconds) })
						: t(`${Root}:failure${choice.action}`),
				value: choice.value,
				default: choice.current
			}))
		}),
		row({
			type: ComponentType.RoleSelect,
			custom_id: id(context, 'role', stage.id),
			placeholder: t(`${Root}:pickRole`),
			...(stage.roleId === null ? {} : { default_values: [{ id: stage.roleId, type: SelectMenuDefaultValueType.Role }] })
		}),
		row(
			{ type: ComponentType.Button, style: ButtonStyle.Primary, label: t(`${Root}:edit`), custom_id: id(context, 'edit', stage.id) },
			{
				type: ComponentType.Button,
				style: ButtonStyle.Secondary,
				label: t(`${Root}:up`),
				custom_id: id(context, 'up', stage.id),
				disabled: index <= 0
			},
			{
				type: ComponentType.Button,
				style: ButtonStyle.Secondary,
				label: t(`${Root}:down`),
				custom_id: id(context, 'down', stage.id),
				disabled: index === config.stages.length - 1
			},
			{
				type: ComponentType.Button,
				style: stage.enabled ? ButtonStyle.Secondary : ButtonStyle.Success,
				label: t(stage.enabled ? `${Root}:stageSwitchOff` : `${Root}:stageSwitchOn`),
				custom_id: id(context, 'switch', stage.id)
			},
			{
				type: ComponentType.Button,
				style: ButtonStyle.Danger,
				label: t(confirmDelete ? `${Root}:deleteConfirm` : `${Root}:delete`),
				custom_id: id(context, 'delete', stage.id, confirmDelete ? 'confirm' : '')
			}
		),
		row(
			{ type: ComponentType.Button, style: ButtonStyle.Secondary, label: t(`${Root}:back`), custom_id: id(context, 'home') },
			{
				type: ComponentType.Button,
				style: ButtonStyle.Secondary,
				label: t(`${Root}:roleClear`),
				custom_id: id(context, 'roleClear', stage.id),
				disabled: stage.roleId === null
			}
		)
	];

	return {
		components: withNotice(context, components),
		flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
		allowed_mentions: { parse: [] }
	};
}

/**
 * The challenges the panel offers a stage: the captcha only once the website serves it, or to the stage that has it.
 */
export function getChallengeChoices(stage: Pick<OnboardingStage, 'challenge'> | null, captchaAvailable: boolean): OnboardingChallenge[] {
	const choices: OnboardingChallenge[] = ['Button', 'Emoji', 'Question'];
	if (captchaAvailable || stage?.challenge === 'Captcha') choices.push('Captcha');
	return choices;
}

/**
 * The failure actions the panel offers: nothing, a kick, or a timeout of one of {@linkcode OnboardingFailureTimeoutChoices},
 * and the timeout the stage has when the dashboard set another one. A value is `None`, `Kick` or `Timeout:<seconds>`.
 */
export function getFailureChoices(stage: Pick<OnboardingStage, 'failureAction' | 'failureTimeout'>) {
	const timeouts: number[] = [...OnboardingFailureTimeoutChoices];
	if (stage.failureAction === 'Timeout' && stage.failureTimeout !== null && !timeouts.includes(stage.failureTimeout)) {
		timeouts.push(stage.failureTimeout);
		timeouts.sort((a, b) => a - b);
	}

	return [
		{ action: 'None' as const, seconds: 0, value: 'None', current: stage.failureAction === 'None' },
		{ action: 'Kick' as const, seconds: 0, value: 'Kick', current: stage.failureAction === 'Kick' },
		...timeouts.map((seconds) => ({
			action: 'Timeout' as const,
			seconds,
			value: `Timeout:${seconds}`,
			current: stage.failureAction === 'Timeout' && stage.failureTimeout === seconds
		}))
	];
}

/**
 * Reads the value of the failure select menu, see {@linkcode getFailureChoices}.
 */
export function parseFailureChoice(value: string): { action: 'None' | 'Kick' | 'Timeout'; timeout: number | null } | null {
	if (value === 'None' || value === 'Kick') return { action: value, timeout: null };

	const [action, seconds] = value.split(':');
	const timeout = Number(seconds);
	return action === 'Timeout' && Number.isSafeInteger(timeout) ? { action, timeout } : null;
}

/**
 * Renders the page told when the onboarding changed since the panel was opened: nothing was saved.
 */
export function renderOnboardingConflict(t: Translator, ownerId: Snowflake): APIInteractionResponseCallbackData {
	// `home` reads the onboarding anew, whatever revision it carries:
	const reload = encodeOnboardingPanelId({ ownerId, verb: 'home', revision: 0, stageId: '', extra: '' });
	return {
		components: [
			{
				type: ComponentType.Container,
				accent_color: Colors.Amber,
				components: [text(`## ${t(`${Root}:conflictTitle`)}\n${t(`${Root}:conflictDescription`)}`)]
			},
			row({ type: ComponentType.Button, style: ButtonStyle.Primary, label: t(`${Root}:reload`), custom_id: reload })
		],
		flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
		allowed_mentions: { parse: [] }
	};
}

/**
 * The values the modal of a stage starts with.
 */
export interface OnboardingStageModalValues {
	readonly name: string;
	readonly question: string | null;
	readonly answers: readonly string[];
	readonly maxAttempts: number;
	readonly timeLimit: number;
}

/**
 * Renders the modal of the texts of a stage: its name, its attempts and its time limit, and its question and answers
 * when the stage is, or becomes, a `Question` one.
 *
 * @param verb - `createSubmit` for a new stage, `editSubmit` for one that exists.
 * @param challenge - The challenge the stage has once submitted.
 */
export function renderOnboardingStageModal(
	context: Pick<OnboardingPanelContext, 't' | 'ownerId' | 'config'>,
	verb: 'createSubmit' | 'editSubmit',
	stageId: string,
	challenge: OnboardingChallenge | 'Any',
	values: OnboardingStageModalValues
): APIModalInteractionResponseCallbackData {
	const { t } = context;
	const input = (
		inputId: string,
		label: TranslationKey,
		description: TranslationKey,
		options: { style: TextInputStyle; required: boolean; maxLength: number; value: string },
		descriptionOptions: Record<string, unknown> = {}
	) => ({
		type: ComponentType.Label as const,
		label: cutText(t(label), 45),
		description: cutText(t(description, descriptionOptions), 100),
		component: {
			type: ComponentType.TextInput as const,
			custom_id: inputId,
			style: options.style,
			required: options.required,
			max_length: options.maxLength,
			...(options.value === '' ? {} : { value: options.value })
		}
	});

	const asksQuestion = challenge === 'Question' || challenge === 'Any';
	const required = challenge === 'Question';
	return {
		custom_id: id(context, verb, stageId, challenge === 'Any' ? '' : challenge),
		title: cutText(t(verb === 'createSubmit' ? `${Root}:modalCreateTitle` : `${Root}:modalEditTitle`), 45),
		components: [
			input(OnboardingStageInputs.name, `${Root}:modalName`, `${Root}:modalNameDescription`, {
				style: TextInputStyle.Short,
				required: true,
				maxLength: MaximumOnboardingStageNameLength,
				value: values.name
			}),
			...(asksQuestion
				? [
						input(OnboardingStageInputs.question, `${Root}:modalQuestion`, `${Root}:modalQuestionDescription`, {
							style: TextInputStyle.Paragraph,
							required,
							maxLength: MaximumOnboardingQuestionLength,
							value: values.question ?? ''
						}),
						input(
							OnboardingStageInputs.answers,
							`${Root}:modalAnswers`,
							`${Root}:modalAnswersDescription`,
							{
								style: TextInputStyle.Paragraph,
								required,
								maxLength: (MaximumOnboardingAnswerLength + 1) * MaximumOnboardingAnswers,
								value: values.answers.join('\n')
							},
							{ maximum: MaximumOnboardingAnswers }
						)
					]
				: []),
			input(
				OnboardingStageInputs.attempts,
				`${Root}:modalAttempts`,
				`${Root}:modalAttemptsDescription`,
				{ style: TextInputStyle.Short, required: true, maxLength: 1, value: String(values.maxAttempts) },
				{ minimum: OnboardingAttemptLimits.minimum, maximum: OnboardingAttemptLimits.maximum }
			),
			input(
				OnboardingStageInputs.timeLimit,
				`${Root}:modalTimeLimit`,
				`${Root}:modalTimeLimitDescription`,
				{
					style: TextInputStyle.Short,
					required: true,
					maxLength: OnboardingTimeLimitInputLength,
					value: formatOnboardingTimeLimitMinutes(values.timeLimit)
				},
				{ minimum: OnboardingTimeLimitLimits.minimum / 60, maximum: OnboardingTimeLimitLimits.maximum / 60 }
			)
		]
	};
}

/**
 * The longest text of the time limit in the modal: `1439.98`, the longest number of minutes
 * {@linkcode formatOnboardingTimeLimitMinutes} writes for a time limit the dashboard can save.
 */
export const OnboardingTimeLimitInputLength = 7;

/**
 * Writes a time limit in seconds as the minutes the modal shows, with two decimals at most: `61` is `1.02`.
 *
 * @remarks The dashboard saves any whole number of seconds. Two decimals of a minute are off by 0.3 seconds at most,
 * so {@linkcode parseOnboardingTimeLimitMinutes} reads every saved value back as it was.
 */
export function formatOnboardingTimeLimitMinutes(seconds: number): string {
	return String(Math.round((seconds / 60) * 100) / 100);
}

/**
 * Reads the minutes typed in the modal as whole seconds. A comma is read as a decimal point.
 *
 * @returns The seconds, `NaN` when the text is no number, which the validation refuses as a time limit out of range.
 */
export function parseOnboardingTimeLimitMinutes(text: string): number {
	const trimmed = text.trim().replace(',', '.');
	const minutes = trimmed.length === 0 ? Number.NaN : Number(trimmed);
	return Number.isFinite(minutes) ? Math.round(minutes * 60) : Number.NaN;
}

/**
 * What the modal of a new stage gives.
 */
export type OnboardingStageModalInput = Pick<OnboardingStageInput, 'name' | 'question' | 'answers' | 'maxAttempts' | 'timeLimit'>;

/**
 * The stage the modal of a new stage creates, normalized: a `Question` stage when a question or an answer is left
 * after trimming, a `Button` stage otherwise.
 *
 * @remarks The choice is made on the normalized text. An answers field left empty reads as one empty answer, which
 * would make a question stage with nothing to ask.
 */
export function createOnboardingStageInput(values: OnboardingStageModalInput): OnboardingStageInput {
	const input = normalizeOnboardingStageInput({ ...OnboardingDefaultStage, ...values });
	return { ...input, challenge: input.question === null && input.answers.length === 0 ? 'Button' : 'Question' };
}

/**
 * What a new stage is set to, but for what its modal gives.
 */
const OnboardingDefaultStage: OnboardingStageInput = {
	name: '',
	enabled: true,
	trigger: 'Join',
	challenge: 'Button',
	question: null,
	answers: [],
	maxAttempts: 3,
	timeLimit: 600,
	roleId: null,
	failureAction: 'None',
	failureTimeout: null
};
