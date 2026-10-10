import { readSettings, writeSettings } from '#lib/database';
import { getAction } from '#lib/moderation/actions';
import type { RoleModerationAction } from '#lib/moderation/actions/base/RoleModerationAction';
import { ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import { decodeRoleSetupId, takePendingRoleSetupCommand } from '#lib/moderation/structures/RoleSetupPrompt';
import type { TypeVariation } from '#utils/moderationConstants';
import { createTranslator, type TranslationKey, type Translator } from '#lib/structures/commands/utils';
import { roleMention } from '@discordjs/formatters';
import { ApplyOptions } from '@wolfstar/decorators';
import { InteractionHandler, ModalSubmitInteraction, UserError, container } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags, type Snowflake } from 'discord-api-types/v10';

type ComponentInteraction = Exclude<InteractionHandler.Interaction, InteractionHandler.ModalInteraction>;

/**
 * Handles the prompt an administrator gets when a moderation command needs a role that is not set up (`/mute add`, the
 * `restrict` commands), see `lib/moderation/structures/RoleSetupPrompt.ts`.
 *
 * @remarks
 *
 * The role that is picked in the select menu becomes the role of the action, the button creates a new one and
 * configures it in every channel, and the other one cancels. Only the administrator who ran the command can answer,
 * and the `administrator` precondition checks the level again at every click.
 */
@ApplyOptions<InteractionHandler.Options>({ preconditions: ['administrator'] })
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const { guildId } = interaction;
		const action = decodeRoleSetupId(content);
		const fail = (message: string) => interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
		if (action === null || guildId === undefined || interaction instanceof ModalSubmitInteraction) return fail(getDefaultExpiredReply());

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		if (interaction.user.id !== action.ownerId) return fail(t('moderationActions:sharedRoleSetupWrongUser'));

		const moderationAction = this.getRoleAction(action.type);
		if (moderationAction === null) return fail(getDefaultExpiredReply());

		const component = interaction as ComponentInteraction;
		switch (action.verb) {
			case 'existing':
				return this.useExisting(component, guildId, moderationAction, t, fail);
			case 'create':
				return this.create(component, guildId, moderationAction, t);
			case 'cancel':
				// The command that waited for the answer is forgotten:
				await takePendingRoleSetupCommand(guildId, action.ownerId, action.type);
				return component.update({ content: t('commands/management:commandHandlerAborted'), components: [], allowed_mentions: { parse: [] } });
			default:
				return fail(getDefaultExpiredReply());
		}
	}

	/**
	 * Makes the role that was picked the role of the action, then runs the command that asked for it.
	 */
	private async useExisting(
		interaction: ComponentInteraction,
		guildId: Snowflake,
		action: RoleModerationAction,
		t: Translator,
		fail: (message: string) => Promise<unknown>
	) {
		const { data } = interaction;
		const roleId = 'values' in data ? (data.values[0] ?? null) : null;
		const role =
			roleId !== null && 'resolved' in data ? (data.resolved as { roles?: Record<string, { managed?: boolean }> }).roles?.[roleId] : undefined;
		if (roleId === null || role === undefined) return fail(getDefaultExpiredReply());

		// `@everyone` cannot be given, and neither can a role an integration manages:
		if (roleId === guildId || role.managed) return fail(t('moderationActions:sharedRoleSetupInvalidRole'));

		// The command that is run after may take longer than Discord waits for an answer:
		const deferred = await interaction.deferUpdate();
		await writeSettings(guildId, { [action.roleKey]: roleId }, interaction.user.id);

		const done = t('moderationActions:sharedRoleSetupExistingDone', { role: roleMention(roleId) });
		return deferred.update(await this.resume(interaction, guildId, action.type, t, done));
	}

	/**
	 * Creates a new role, makes it the role of the action and configures it in every channel, then runs the command that
	 * asked for it.
	 */
	private async create(interaction: ComponentInteraction, guildId: Snowflake, action: RoleModerationAction, t: Translator) {
		// Every channel is edited, which takes longer than Discord waits for an answer:
		const deferred = await interaction.deferUpdate();
		const close = (message: string) => deferred.update({ content: message, components: [], allowed_mentions: { parse: [] } });

		try {
			const guild = await container.gatewayClient.guilds.fetch(guildId);
			await action.setup({ guild, author: interaction.user, confirm: () => true });
		} catch (error) {
			if (error instanceof UserError) return close(t(error.identifier as TranslationKey, error.context as Record<string, unknown>));

			this.container.logger.error('[Role setup] Could not create the role of a moderation action:', error);
			return close(t('events/errors:unexpectedError'));
		}

		const settings = await readSettings(guildId);
		const roleId = settings[action.roleKey];
		const done = t('moderationActions:sharedRoleSetupNewDone', { role: roleId ? roleMention(roleId) : '' });
		return deferred.update(await this.resume(interaction, guildId, action.type, t, done));
	}

	/**
	 * Runs the command that opened the prompt, with the options it was given, now that its role is set up.
	 *
	 * @param done - What was set up, which the answer of the command follows.
	 * @returns The message the prompt becomes. When the command is not there anymore (it waited too long, or it is gone
	 * after an update), or when it asks again, the administrator is told to run it again.
	 */
	private async resume(interaction: ComponentInteraction, guildId: Snowflake, type: TypeVariation, t: Translator, done: string) {
		const close = (message: string) => ({
			content: message === '' ? done : `${done}\n${message}`,
			components: [],
			allowed_mentions: { parse: [] }
		});
		const again = () => close(t('moderationActions:sharedRoleSetupRunAgain'));

		const pending = await takePendingRoleSetupCommand(guildId, interaction.user.id, type);
		if (pending === null) return again();

		const command = container.stores.get('commands').find((piece) => piece.name === pending.command);
		if (!(command instanceof ModerationCommand)) return again();

		try {
			// Only the guild, the channel, the author and their language are read, which a click has as a command does:
			const answer = await command.execute(
				interaction as unknown as ModerationCommand.Interaction,
				pending.args as unknown as ModerationCommand.Arguments
			);
			if (answer.components?.length) return again();

			// What the command did follows what was set up, as the embed of its case:
			return { ...close(answer.content ?? ''), embeds: answer.embeds ?? [] };
		} catch (error) {
			this.container.logger.error('[Role setup] Could not run the command that asked for the role:', error);
			return again();
		}
	}

	/**
	 * Gets the moderation action of a type when it is one that gives a role.
	 */
	private getRoleAction(type: Parameters<typeof getAction>[0]): RoleModerationAction | null {
		try {
			const action = getAction(type) as unknown as Partial<RoleModerationAction>;
			return typeof action?.roleKey === 'string' && typeof action.setup === 'function' ? (action as RoleModerationAction) : null;
		} catch {
			return null;
		}
	}
}
