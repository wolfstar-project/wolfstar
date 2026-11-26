import { getOnboardingEmojiChallenge, isOnboardingExpired, type OnboardingStep } from '#lib/onboarding/flow';
import { decodeOnboardingVerifyId, encodeOnboardingVerifyId, type OnboardingVerifyAction } from '#lib/onboarding/ids';
import { OnboardingEventsRoot } from '#lib/onboarding/log';
import {
	advanceOnboardingLocked,
	failOnboardingStageLocked,
	fetchOnboardingMember,
	passOnboardingStageLocked,
	recordWrongOnboardingAnswerLocked,
	startOnboardingStage
} from '#lib/onboarding/members';
import {
	OnboardingAnswerInputId,
	renderOnboardingEmojiChallenge,
	renderOnboardingNotice,
	renderOnboardingNoticeUpdate,
	renderOnboardingQuestionModal,
	type OnboardingNoticeButton
} from '#lib/onboarding/render';
import { readOnboardingConfig, withOnboardingMemberLock } from '#lib/onboarding/store';
import { createTranslator, type TranslationKey, type Translator } from '#lib/structures/commands/utils';
import { InteractionHandler, ModalSubmitInteraction } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import {
	MessageFlags,
	type APIInteractionResponseCallbackData,
	type APIModalInteractionResponseCallbackData,
	type Snowflake
} from 'discord-api-types/v10';
import { getModalValue } from 'wolfstar-shared';
import {
	fetchOnboardingVerification,
	isOnboardingAnswerCorrect,
	type OnboardingConfig,
	type OnboardingStage,
	type OnboardingVerification
} from 'wolfstar-database';

const Root = OnboardingEventsRoot;

type ComponentInteraction = Exclude<InteractionHandler.Interaction, InteractionHandler.ModalInteraction>;

/**
 * What the handler answers with: a private message, the challenge in place of the message clicked, or a modal.
 */
type Answer =
	| { readonly kind: 'Reply'; readonly body: APIInteractionResponseCallbackData }
	| { readonly kind: 'Update'; readonly body: APIInteractionResponseCallbackData }
	| { readonly kind: 'Modal'; readonly body: APIModalInteractionResponseCallbackData };

/**
 * Handles the members' side of the onboarding, see `lib/onboarding`: the button of the verification message, which
 * starts or shows the member's stage, the emojis of an `Emoji` stage and the modal of a `Question` stage.
 *
 * @remarks Every change of a member's row runs under the lock of the member, and a component carries the attempts the
 * row had when it was shown: a click on an older one is refused, so nobody answers the same challenge twice.
 */
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const action = decodeOnboardingVerifyId(content);
		const { guildId } = interaction;
		if (action === null || guildId === undefined) {
			return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });
		}

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const answer = await this.handle(interaction, action, guildId, t);
		switch (answer.kind) {
			case 'Modal':
				return (interaction as ComponentInteraction).showModal(answer.body);
			case 'Update':
				return interaction instanceof ModalSubmitInteraction ? interaction.reply(answer.body) : interaction.update(answer.body);
			case 'Reply':
				return interaction.reply(answer.body);
		}
	}

	private async handle(
		interaction: InteractionHandler.Interaction,
		action: OnboardingVerifyAction,
		guildId: Snowflake,
		t: Translator
	): Promise<Answer> {
		const reply = (key: TranslationKey, options?: Record<string, unknown>, button: OnboardingNoticeButton | null = null): Answer => ({
			kind: 'Reply',
			body: renderOnboardingNotice(t(key, options), button)
		});

		const config = await readOnboardingConfig(guildId);
		if (!config.settings.enabled) return reply(`${Root}:off`);

		const member = await fetchOnboardingMember(guildId, interaction.user.id);
		if (member === null) return reply(`${Root}:notMember`);

		if (action.verb === 'start') {
			if (action.guildId !== guildId) return { kind: 'Reply', body: renderOnboardingNotice(getDefaultExpiredReply()) };
			return this.start(member, interaction.user.id, config, t);
		}

		return withOnboardingMemberLock(guildId, interaction.user.id, async () => {
			const verification = await fetchOnboardingVerification(this.container.prisma.orm, action.verificationId);
			if (
				verification === null ||
				verification.guildId !== guildId ||
				verification.userId !== interaction.user.id ||
				verification.status !== 'Waiting' ||
				verification.attempts !== action.attempts
			) {
				return reply(`${Root}:stale`);
			}

			const stage = config.stages.find((entry) => entry.id === verification.stageId);
			if (stage === undefined) return reply(`${Root}:stale`);

			const guild = await this.container.gatewayClient.guilds.fetch(guildId);
			if (isOnboardingExpired(stage, verification, Date.now())) {
				await failOnboardingStageLocked(guild, config, stage, verification, 'TimeLimit');
				return reply(`${Root}:expired`);
			}

			switch (action.verb) {
				case 'ask':
					return stage.challenge === 'Question'
						? { kind: 'Modal', body: renderOnboardingQuestionModal(t, stage, verification) }
						: reply(`${Root}:stale`);
				case 'emoji': {
					if (stage.challenge !== 'Emoji') return reply(`${Root}:stale`);
					const { target } = getOnboardingEmojiChallenge(verification.id, verification.attempts);
					return this.answer(guild, member, config, stage, verification, action.index === target, t, true);
				}
				case 'answer': {
					if (stage.challenge !== 'Question' || !(interaction instanceof ModalSubmitInteraction)) return reply(`${Root}:stale`);
					const text = getModalValue(interaction.data.components, OnboardingAnswerInputId) ?? '';
					return this.answer(guild, member, config, stage, verification, isOnboardingAnswerCorrect(stage.answers, text), t, false);
				}
			}
		});
	}

	/**
	 * The button of the verification message: it starts the member's next stage when it can start, a stage they failed
	 * again when they may, and shows its challenge.
	 */
	private async start(member: GuildMember, userId: Snowflake, config: OnboardingConfig, t: Translator): Promise<Answer> {
		return withOnboardingMemberLock(member.guildId, userId, async () => {
			let step = await advanceOnboardingLocked(member, config);
			if (step?.kind === 'Failed' && step.retry) {
				step = { kind: 'Waiting', stage: step.stage, verification: await startOnboardingStage(member.guildId, userId, step.stage) };
			}

			const reply = (key: TranslationKey, options?: Record<string, unknown>): Answer => ({
				kind: 'Reply',
				body: renderOnboardingNotice(t(key, options))
			});
			if (step === null || step.kind === 'Done') return reply(`${Root}:done`);
			if (step.kind === 'AwaitNativeOnboarding') return reply(`${Root}:awaitNative`, { stage: step.stage.name });
			if (step.kind === 'Failed') return reply(`${Root}:failedFinal`, { stage: step.stage.name });
			// `Start` became `Waiting` when the row was written:
			if (step.kind === 'Start') return reply(`${Root}:stale`);

			const { stage, verification } = step;
			const guild = await this.container.gatewayClient.guilds.fetch(member.guildId);
			if (isOnboardingExpired(stage, verification, Date.now())) {
				await failOnboardingStageLocked(guild, config, stage, verification, 'TimeLimit');
				return reply(`${Root}:expired`);
			}

			switch (stage.challenge) {
				case 'Button':
					return this.answer(guild, member, config, stage, verification, true, t, false);
				case 'Emoji':
					return { kind: 'Reply', body: renderOnboardingEmojiChallenge(t, stage, verification) };
				case 'Question':
					return { kind: 'Modal', body: renderOnboardingQuestionModal(t, stage, verification) };
				case 'Captcha':
					return reply(`${Root}:captchaUnavailable`);
			}
		});
	}

	/**
	 * Passes the member, or counts a wrong answer. Called under the lock of the member.
	 *
	 * @param update - Whether the answer takes the place of the message clicked, the emoji challenge.
	 */
	private async answer(
		guild: Guild,
		member: GuildMember,
		config: OnboardingConfig,
		stage: OnboardingStage,
		verification: OnboardingVerification,
		correct: boolean,
		t: Translator,
		update: boolean
	): Promise<Answer> {
		const respond = (content: string, button: OnboardingNoticeButton | null = null): Answer =>
			update
				? { kind: 'Update', body: renderOnboardingNoticeUpdate(content, button) }
				: { kind: 'Reply', body: renderOnboardingNotice(content, button) };

		if (correct) {
			const { passed, next } = await passOnboardingStageLocked(member, config, stage, verification);
			if (!passed) return respond(t(`${Root}:stale`));
			return respond(...this.describeNext(t, stage, next));
		}

		const left = await recordWrongOnboardingAnswerLocked(guild, config, stage, verification);
		if (left === null) return respond(t(`${Root}:stale`));
		if (left === 0) return respond(t(`${Root}:failed`, { stage: stage.name }));

		const notice = t(`${Root}:wrong`, { count: left });
		const next = { id: verification.id, attempts: verification.attempts + 1 };
		if (stage.challenge === 'Emoji')
			return { kind: 'Update', body: { ...renderOnboardingEmojiChallenge(t, stage, next, notice), flags: MessageFlags.IsComponentsV2 } };
		return respond(notice, {
			label: t(`${Root}:answerAgain`),
			customId: encodeOnboardingVerifyId({ verb: 'ask', verificationId: verification.id, attempts: next.attempts })
		});
	}

	/**
	 * What the member is told once they passed a stage: they are in, or what comes next.
	 */
	private describeNext(t: Translator, stage: OnboardingStage, next: OnboardingStep | null): [string, OnboardingNoticeButton | null] {
		if (next === null || next.kind === 'Done') return [t(`${Root}:passedDone`, { stage: stage.name }), null];
		if (next.kind === 'AwaitNativeOnboarding') return [t(`${Root}:passedAwaitNative`, { stage: stage.name, next: next.stage.name }), null];

		const button = { label: t(`${Root}:continue`), customId: encodeOnboardingVerifyId({ verb: 'start', guildId: stage.guildId }) };
		return [t(`${Root}:passedNext`, { stage: stage.name, next: next.stage.name }), button];
	}
}
