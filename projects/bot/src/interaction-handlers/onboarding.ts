import { resolveOnErrorCodes } from '#common';
import { readSettings, writeSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import { getJoinGuardRoleProblem } from '#lib/moderation/joinguard/permissions';
import { canManageServerSettingsFrom } from '#lib/structures/commands/permissions';
import { getOnboardingChannelProblem } from '#lib/onboarding/discord';
import { decodeOnboardingPanelId, type OnboardingPanelAction } from '#lib/onboarding/ids';
import {
	describeOnboardingProblems,
	OnboardingPanelRoot,
	OnboardingStageInputs,
	parseFailureChoice,
	renderOnboardingConflict,
	renderOnboardingPanel,
	renderOnboardingStageModal,
	renderOnboardingStagePage
} from '#lib/onboarding/panel';
import { loadOnboardingPanel, type LoadedOnboardingPanel } from '#lib/onboarding/panelData';
import { OnboardingCaptchaAvailable } from '#lib/onboarding/readiness';
import { renderOnboardingMessage } from '#lib/onboarding/render';
import { announceOnboardingChange } from '#lib/onboarding/store';
import { createTranslator, type TranslationKey, type Translator } from '#lib/structures/commands/utils';
import { InteractionHandler, ModalSubmitInteraction } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import { getModalValue } from 'wolfstar-shared';
import {
	createOnboardingStage,
	deleteOnboardingStage,
	moveOnboardingStageBy,
	normalizeOnboardingStageInput,
	refuseOnboardingWrite,
	setOnboardingLogChannel,
	setOnboardingMessage,
	fetchOnboardingConfig,
	setOnboardingStageEnabled,
	updateOnboardingStage,
	writeOnboarding,
	type OnboardingChallenge,
	type OnboardingStage,
	type OnboardingStageInput,
	type OnboardingWrite
} from 'wolfstar-database';

const Root = OnboardingPanelRoot;

type ComponentInteraction = Exclude<InteractionHandler.Interaction, InteractionHandler.ModalInteraction>;

/**
 * Where the panel goes once a write is done: the summary, or the page of a stage.
 */
type PanelPage = { readonly kind: 'Home' } | { readonly kind: 'Stage'; readonly stageId: string };

/**
 * Handles the panel of the onboarding, `/settings onboarding`, see `lib/onboarding/panel.ts`.
 *
 * @remarks
 *
 * Only the administrator who opened the panel can use it, and who manages the settings is checked again at every
 * click. Every write is made with the revision the panel showed (`writeOnboarding`): a write of the dashboard or of
 * another panel since makes it refuse, say so, and offer to load the onboarding again.
 */
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const action = decodeOnboardingPanelId(content);
		const { guildId } = interaction;
		const fail = (message: string) => interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
		if (action === null || guildId === undefined) return fail(getDefaultExpiredReply());

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		if (interaction.user.id !== action.ownerId) return fail(t('commands/conf:menuWrongUser'));
		if (interaction.member === undefined || !(await canManageServerSettingsFrom({ guildId, member: interaction.member }))) {
			return fail(t('preconditions:administrator', { command: { name: 'settings onboarding' } }));
		}

		if (interaction instanceof ModalSubmitInteraction) return this.submit(interaction, guildId, action, t);

		const component = interaction as ComponentInteraction;
		switch (action.verb) {
			case 'home':
			case 'stage': {
				const page: PanelPage = action.verb === 'home' ? { kind: 'Home' } : { kind: 'Stage', stageId: getValue(component) };
				const deferred = await component.deferUpdate();
				return deferred.update(this.render(await loadOnboardingPanel(guildId, action.ownerId, t), page));
			}
			case 'toggle':
				return this.toggle(component, guildId, action, t);
			case 'create':
				return this.openModal(component, guildId, action, t, 'Any');
			case 'edit':
				return this.openModal(component, guildId, action, t, null);
			case 'challenge':
				return this.setChallenge(component, guildId, action, t);
			case 'trigger':
				return this.editStage(component, guildId, action, t, (stage) => ({
					...stage,
					trigger: getValue(component) === 'NativeOnboarding' ? 'NativeOnboarding' : 'Join'
				}));
			case 'failure':
				return this.setFailure(component, guildId, action, t);
			case 'role':
				return this.setRole(component, guildId, action, t, getValue(component));
			case 'roleClear':
				return this.editStage(component, guildId, action, t, (stage) => ({ ...stage, roleId: null }));
			case 'up':
			case 'down':
				return this.write(component, guildId, action, t, moveOnboardingStageBy(action.stageId, action.verb === 'up' ? -1 : 1), {
					kind: 'Stage',
					stageId: action.stageId
				});
			case 'switch':
				return this.switchStage(component, guildId, action, t);
			case 'delete':
				return this.delete(component, guildId, action, t);
			case 'log':
				return this.setLogChannel(component, guildId, action, t, getValue(component));
			case 'logClear':
				return this.write(component, guildId, action, t, setOnboardingLogChannel(null), { kind: 'Home' });
			case 'post':
				return this.post(component, guildId, action, t, getValue(component));
			default:
				return fail(getDefaultExpiredReply());
		}
	}

	private render(panel: LoadedOnboardingPanel, page: PanelPage, notice: string | null = null, confirmDelete = false) {
		const context = { ...panel, notice };
		if (page.kind === 'Stage') {
			const stage = panel.config.stages.find((entry) => entry.id === page.stageId);
			if (stage !== undefined) return renderOnboardingStagePage(context, stage, confirmDelete);
		}
		return renderOnboardingPanel(context);
	}

	/**
	 * Writes with the revision the panel showed, then shows the page again, read anew.
	 */
	private async write<Value>(
		interaction: ComponentInteraction | ModalSubmitInteraction,
		guildId: Snowflake,
		action: OnboardingPanelAction,
		t: Translator,
		write: OnboardingWrite<Value>,
		page: PanelPage | ((value: Value) => PanelPage),
		after?: (value: Value) => Promise<void>
	) {
		const deferred = await interaction.deferUpdate();
		const result = await writeOnboarding(this.container.prisma, guildId, action.revision, write);
		if (!result.ok) {
			if (result.error.code === 'Conflict') {
				return deferred.update(renderOnboardingConflict(t, action.ownerId));
			}

			const panel = await loadOnboardingPanel(guildId, action.ownerId, t);
			const notice = result.error.code === 'Invalid' ? describeOnboardingProblems(t, result.error.problems) : t(`${Root}:unknownStage`);
			return deferred.update(this.render(panel, typeof page === 'function' ? { kind: 'Home' } : page, notice));
		}

		await after?.(result.value);
		announceOnboardingChange(guildId);
		const panel = await loadOnboardingPanel(guildId, action.ownerId, t);
		return deferred.update(this.render(panel, typeof page === 'function' ? page(result.value) : page, t(`${Root}:saved`)));
	}

	/**
	 * Reads the stage the panel showed and writes what it becomes, refused at once when the onboarding changed since.
	 */
	private async editStage(
		interaction: ComponentInteraction | ModalSubmitInteraction,
		guildId: Snowflake,
		action: OnboardingPanelAction,
		t: Translator,
		change: (stage: OnboardingStageInput) => OnboardingStageInput
	) {
		return this.write(
			interaction,
			guildId,
			action,
			t,
			async (tx, stages, id) => {
				const stage = stages.find((entry) => entry.id === action.stageId) ?? refuseOnboardingWrite({ code: 'UnknownStage' });
				const input = normalizeOnboardingStageInput(change(toInput(stage)));
				return updateOnboardingStage(stage.id, input, OnboardingCaptchaAvailable)(tx, stages, id);
			},
			{ kind: 'Stage', stageId: action.stageId }
		);
	}

	private async toggle(interaction: ComponentInteraction, guildId: Snowflake, action: OnboardingPanelAction, t: Translator) {
		const deferred = await interaction.deferUpdate();
		const settings = await readSettings(guildId);
		await writeSettings(guildId, { onboardingEnabled: !settings.onboardingEnabled }, interaction.user.id);
		announceOnboardingChange(guildId);
		return deferred.update(this.render(await loadOnboardingPanel(guildId, action.ownerId, t), { kind: 'Home' }, t(`${Root}:saved`)));
	}

	private async switchStage(interaction: ComponentInteraction, guildId: Snowflake, action: OnboardingPanelAction, t: Translator) {
		// Switching only flips the stage, as it is in the transaction, so a captcha stage can always be switched off:
		return this.write(
			interaction,
			guildId,
			action,
			t,
			async (tx, stages, id) => {
				const stage = stages.find((entry) => entry.id === action.stageId) ?? refuseOnboardingWrite({ code: 'UnknownStage' });
				return setOnboardingStageEnabled(stage.id, !stage.enabled)(tx, stages, id);
			},
			{ kind: 'Stage', stageId: action.stageId }
		);
	}

	private async delete(interaction: ComponentInteraction, guildId: Snowflake, action: OnboardingPanelAction, t: Translator) {
		if (action.extra !== 'confirm') {
			const deferred = await interaction.deferUpdate();
			const panel = await loadOnboardingPanel(guildId, action.ownerId, t);
			if (panel.config.settings.revision !== action.revision) return deferred.update(renderOnboardingConflict(t, action.ownerId));
			return deferred.update(this.render(panel, { kind: 'Stage', stageId: action.stageId }, t(`${Root}:deleteAsk`), true));
		}

		return this.write(interaction, guildId, action, t, deleteOnboardingStage(action.stageId), { kind: 'Home' });
	}

	/**
	 * Opens the modal of a new stage, or of the texts of a stage. A challenge set to `Question` from the select menu opens
	 * it too, since the question and the answers have to be written first.
	 *
	 * @param challenge - The challenge the stage gets once submitted, `Any` for a new stage (a question makes it a
	 * `Question` stage), `null` to keep the stage's.
	 */
	private async openModal(
		interaction: ComponentInteraction,
		guildId: Snowflake,
		action: OnboardingPanelAction,
		t: Translator,
		challenge: OnboardingChallenge | 'Any' | null
	) {
		// Only the database is read: a modal is the first answer to a click, which Discord waits three seconds for.
		const config = await fetchOnboardingConfig(this.container.prisma.orm, guildId);
		// The modal keeps the revision the panel showed, so it is told a conflict when it is submitted:
		const context = { t, ownerId: action.ownerId, config: { ...config, settings: { ...config.settings, revision: action.revision } } };
		if (challenge === 'Any') {
			return interaction.showModal(
				renderOnboardingStageModal(context, 'createSubmit', '', 'Any', {
					name: '',
					question: null,
					answers: [],
					maxAttempts: 3,
					timeLimit: 600
				})
			);
		}

		const stage = config.stages.find((entry) => entry.id === action.stageId);
		if (stage === undefined) return interaction.reply({ content: t(`${Root}:unknownStage`), flags: MessageFlags.Ephemeral });
		return interaction.showModal(renderOnboardingStageModal(context, 'editSubmit', stage.id, challenge ?? stage.challenge, stage));
	}

	private async setChallenge(interaction: ComponentInteraction, guildId: Snowflake, action: OnboardingPanelAction, t: Translator) {
		const value = getValue(interaction);
		if (value === 'Question') return this.openModal(interaction, guildId, action, t, 'Question');

		const challenge: OnboardingChallenge = value === 'Emoji' ? 'Emoji' : value === 'Captcha' ? 'Captcha' : 'Button';
		return this.editStage(interaction, guildId, action, t, (stage) => ({ ...stage, challenge, question: null, answers: [] }));
	}

	private async setFailure(interaction: ComponentInteraction, guildId: Snowflake, action: OnboardingPanelAction, t: Translator) {
		const choice = parseFailureChoice(getValue(interaction));
		if (choice === null) return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });
		return this.editStage(interaction, guildId, action, t, (stage) => ({
			...stage,
			failureAction: choice.action,
			failureTimeout: choice.timeout
		}));
	}

	/**
	 * Gives a stage a role, refused when the bot cannot give it: not a role of the guild, `@everyone`, managed by an
	 * integration, or not below the bot's highest role.
	 */
	private async setRole(interaction: ComponentInteraction, guildId: Snowflake, action: OnboardingPanelAction, t: Translator, roleId: string) {
		const problem = roleId === '' ? 'unknown' : await getJoinGuardRoleProblem(guildId, roleId);
		if (problem !== null) {
			const deferred = await interaction.deferUpdate();
			const panel = await loadOnboardingPanel(guildId, action.ownerId, t);
			return deferred.update(
				this.render(panel, { kind: 'Stage', stageId: action.stageId }, t(`${Root}:role${capitalize(problem)}` as TranslationKey))
			);
		}
		return this.editStage(interaction, guildId, action, t, (stage) => ({ ...stage, roleId }));
	}

	/**
	 * Sets the log channel, only when the bot can post there: a refusal names what it lacks and keeps the previous one.
	 */
	private async setLogChannel(
		interaction: ComponentInteraction,
		guildId: Snowflake,
		action: OnboardingPanelAction,
		t: Translator,
		channelId: string
	) {
		const problem = channelId === '' ? ({ code: 'NotTextChannel' } as const) : await getOnboardingChannelProblem(guildId, channelId);
		if (problem !== null) {
			const deferred = await interaction.deferUpdate();
			const panel = await loadOnboardingPanel(guildId, action.ownerId, t);
			return deferred.update(this.render(panel, { kind: 'Home' }, describeChannelProblem(t, problem)));
		}
		return this.write(interaction, guildId, action, t, setOnboardingLogChannel(channelId), { kind: 'Home' });
	}

	/**
	 * Posts the verification message in a channel, or moves it there: the new one is posted first, the guarded write
	 * remembers it, and only then is the old one deleted. A refused write deletes the new one.
	 */
	private async post(interaction: ComponentInteraction, guildId: Snowflake, action: OnboardingPanelAction, t: Translator, channelId: string) {
		const deferred = await interaction.deferUpdate();
		const problem = channelId === '' ? ({ code: 'NotTextChannel' } as const) : await getOnboardingChannelProblem(guildId, channelId);
		if (problem !== null)
			return deferred.update(
				this.render(await loadOnboardingPanel(guildId, action.ownerId, t), { kind: 'Home' }, describeChannelProblem(t, problem))
			);

		const guildT = await fetchGuildT(await this.container.gatewayClient.guilds.fetch(guildId));
		const { api } = this.container.gatewayClient;
		const panel = await loadOnboardingPanel(guildId, action.ownerId, t);
		const previous = panel.config.settings;
		if (previous.channelId === channelId && previous.messageId !== null && panel.readiness.hasMessage) {
			await api.channels.editMessage(channelId, previous.messageId, renderOnboardingMessage(guildT, guildId));
			return deferred.update(this.render(panel, { kind: 'Home' }, t(`${Root}:messageEdited`)));
		}

		const posted = await api.channels.createMessage(channelId, renderOnboardingMessage(guildT, guildId));
		const result = await writeOnboarding(this.container.prisma, guildId, action.revision, setOnboardingMessage(channelId, posted.id));
		if (!result.ok) {
			await resolveOnErrorCodes(api.channels.deleteMessage(channelId, posted.id), RESTJSONErrorCodes.UnknownMessage);
			return deferred.update(renderOnboardingConflict(t, action.ownerId));
		}

		if (previous.channelId !== null && previous.messageId !== null) {
			await resolveOnErrorCodes(
				api.channels.deleteMessage(previous.channelId, previous.messageId),
				RESTJSONErrorCodes.UnknownMessage,
				RESTJSONErrorCodes.UnknownChannel,
				RESTJSONErrorCodes.MissingAccess
			);
		}

		announceOnboardingChange(guildId);
		return deferred.update(this.render(await loadOnboardingPanel(guildId, action.ownerId, t), { kind: 'Home' }, t(`${Root}:messagePosted`)));
	}

	/**
	 * Reads the modal of a new stage, or of the texts of one.
	 */
	private async submit(interaction: ModalSubmitInteraction, guildId: Snowflake, action: OnboardingPanelAction, t: Translator) {
		const values = readStageModal(interaction);
		if (action.verb === 'createSubmit') {
			const input = normalizeOnboardingStageInput({
				...DefaultStage,
				...values,
				challenge: values.question === null && values.answers.length === 0 ? 'Button' : 'Question'
			});
			return this.write(interaction, guildId, action, t, createOnboardingStage(input, OnboardingCaptchaAvailable), (stage) => ({
				kind: 'Stage',
				stageId: stage.id
			}));
		}

		if (action.verb !== 'editSubmit') return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });
		const challenge = action.extra === 'Question' ? 'Question' : null;
		return this.editStage(interaction, guildId, action, t, (stage) => ({
			...stage,
			...values,
			challenge: challenge ?? stage.challenge,
			// The modal of a stage that is no question has no question to read:
			...((challenge ?? stage.challenge) === 'Question' ? {} : { question: null, answers: [] })
		}));
	}
}

const DefaultStage: OnboardingStageInput = {
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

function toInput(stage: OnboardingStage): OnboardingStageInput {
	const { id: _id, guildId: _guildId, position: _position, createdAt: _createdAt, ...input } = stage;
	return input;
}

function readStageModal(interaction: ModalSubmitInteraction) {
	const read = (inputId: string) => getModalValue(interaction.data.components, inputId);
	const question = read(OnboardingStageInputs.question);
	const minutes = Number((read(OnboardingStageInputs.timeLimit) ?? '').trim().replace(',', '.'));
	return {
		name: read(OnboardingStageInputs.name) ?? '',
		question,
		answers: (read(OnboardingStageInputs.answers) ?? '').split('\n'),
		maxAttempts: Number((read(OnboardingStageInputs.attempts) ?? '').trim()),
		// Minutes in the modal, seconds in the row; what is not a number is refused as a time limit out of range:
		timeLimit: Number.isFinite(minutes) ? Math.round(minutes * 60) : Number.NaN
	};
}

function getValue(interaction: ComponentInteraction): string {
	const { data } = interaction;
	return 'values' in data ? (data.values[0] ?? '') : '';
}

function capitalize(text: string) {
	return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function describeChannelProblem(
	t: Translator,
	problem: { code: 'NotTextChannel' } | { code: 'MissingPermissions'; missing: readonly string[] }
): string {
	if (problem.code === 'NotTextChannel') return t(`${Root}:channelNotText`);
	return t(`${Root}:channelMissingPermissions`, { missing: problem.missing.map((name) => t(`permissions:${name}` as TranslationKey)).join(', ') });
}
