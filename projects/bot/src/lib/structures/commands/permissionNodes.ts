import { PermissionNodeAction } from '#lib/database';
import { translateKey, type GuildChatInputInteraction, type TranslationKey } from '#lib/structures/commands/utils';
import { resolveOnErrorCodes } from '#common';
import type { SlashCommandSubcommandBuilder } from '@discordjs/builders';
import { UserError, container, type TransformedArguments } from '@wolfstar/http-framework';
import { Role, type GuildMember } from '@wolfstar/plugin-gateway';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT, type TFunction } from '@wolfstar/plugin-i18next';
import { MessageFlags, RESTJSONErrorCodes } from 'discord-api-types/v10';

/**
 * The pieces the `add`, `remove`, `reset` and `show` subcommands of `permission-nodes` have in common. The nodes are
 * edited with `PermissionNodeManager`, see `readSettingsPermissionNodes`.
 */

export const PermissionNodesRoot = 'commands/management';

export type PermissionNodeTarget = Role | GuildMember;

export interface PermissionNodeTargetOptions {
	target: TransformedArguments.Mentionable;
}

export interface PermissionNodeOptions extends PermissionNodeTargetOptions {
	type: 'allow' | 'deny';
	command: string;
}

export function toPermissionNodeAction(type: PermissionNodeOptions['type']) {
	return type === 'allow' ? PermissionNodeAction.Allow : PermissionNodeAction.Deny;
}

export function applyAddOrRemove(subcommand: SlashCommandSubcommandBuilder, name: 'Add' | 'Remove') {
	return applyLocalizedBuilder(subcommand, `${PermissionNodesRoot}:permissionNodesSubcommand${name}`)
		.addMentionableOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsTarget').setRequired(true))
		.addStringOption((option) =>
			applyLocalizedBuilder(option, `${PermissionNodesRoot}:permissionNodesOptionsType`)
				.setRequired(true)
				.setChoices(
					createLocalizedChoice(`${PermissionNodesRoot}:permissionNodesOptionsTypeChoiceAllow`, { value: 'allow' }),
					createLocalizedChoice(`${PermissionNodesRoot}:permissionNodesOptionsTypeChoiceDeny`, { value: 'deny' })
				)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsCommand').setRequired(true).setAutocomplete(true));
}

/**
 * Replies with the result of a handler and translates the {@linkcode UserError} it throws.
 *
 * @remarks The permission level is checked by the handler, with `RequiresCommandPermissionLevel`.
 */
export async function replyWithPermissionNodeResult(interaction: GuildChatInputInteraction, callback: (t: TFunction) => Promise<string>) {
	const t = getSupportedUserLanguageT(interaction);
	try {
		const content = await callback(t);
		return await interaction.reply({ content, flags: MessageFlags.Ephemeral });
	} catch (error) {
		if (!(error instanceof UserError)) throw error;

		const content = translateKey(t, error.identifier as TranslationKey, error.context as Record<string, unknown> | undefined);
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}

/**
 * Resolves the `target` option, a role or a member of the guild, to the structures `PermissionNodeManager` takes.
 */
export async function resolveTarget(
	interaction: GuildChatInputInteraction,
	mentionable: TransformedArguments.Mentionable
): Promise<PermissionNodeTarget> {
	const { gatewayClient } = container;

	if ('role' in mentionable) {
		const roles = await gatewayClient.roles.fetchAll(interaction.guildId);
		const role = roles.find((role) => role.id === mentionable.role.id);
		if (role) return role;
	} else if ('user' in mentionable) {
		const member = await resolveOnErrorCodes(
			gatewayClient.members.fetch(interaction.guildId, mentionable.user.id),
			RESTJSONErrorCodes.UnknownMember
		);
		if (member) return member;
	}

	throw new UserError({ identifier: 'arguments:memberError', context: { parameter: mentionable.id } });
}

/**
 * Checks whether the author can edit and preview the nodes of a target.
 */
export async function checkPermissions(interaction: GuildChatInputInteraction, target: PermissionNodeTarget): Promise<boolean> {
	const { gatewayClient } = container;
	const authorId = interaction.user.id;

	// If it's to itself, always block
	if (authorId === target.id) return false;

	const guild = await gatewayClient.guilds.fetch(interaction.guildId);

	// If the target is the owner, always block
	if (guild.ownerId === target.id) return false;

	// If the author is the owner, always allow
	if (authorId === guild.ownerId) return true;

	// Check hierarchy role positions, allow when greater, block otherwise
	const author = await gatewayClient.members.fetch(interaction.guildId, authorId);
	// Fetched, not read from the cache: a role the cache does not hold would count as the lowest one.
	const targetPosition = target instanceof Role ? target.position : ((await target.roles.fetchHighest())?.position ?? 0);
	const authorPosition = (await author.roles.fetchHighest())?.position ?? 0;
	return authorPosition > targetPosition;
}
