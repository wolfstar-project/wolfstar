import { readSettings, writeSettings } from '#lib/database';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { BrandingColors } from '#utils/constants';
import { EmbedBuilder } from '@discordjs/builders';
import { container, type TransformedArguments } from '@wolfstar/http-framework';
import { getSupportedUserLanguageT, type TFunction } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';

const Root = 'commands/management';
const MaximumDescriptionLength = 4096;

/**
 * Lists the public roles of the server in one embed, cut at the limit of the description of an embed, and removes the
 * roles that no longer exist from the settings.
 */
export async function listPublicRoles(interaction: GuildChatInputInteraction) {
	const t = getSupportedUserLanguageT(interaction);
	const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });

	const settings = await readSettings(interaction.guildId);
	const { rolesPublic } = settings;
	if (rolesPublic.length === 0) return deferred.update({ content: translateKey(t, `${Root}:rolesListEmpty`) });

	const guildRoles = await container.gatewayClient.roles.fetchAll(interaction.guildId);
	const names = new Map(guildRoles.map((role) => [role.id, role.name] as const));

	const roles: string[] = [];
	const remove = new Set<string>();
	for (const roleId of rolesPublic) {
		const name = names.get(roleId);
		if (name === undefined) remove.add(roleId);
		else roles.push(name);
	}

	// Automatic role deletion
	if (remove.size > 0) {
		await writeSettings(interaction.guildId, { rolesPublic: rolesPublic.filter((id: string) => !remove.has(id)) });
	}

	// There's the possibility all roles could be inexistent, therefore the system
	// would filter and remove them all, causing this to be empty.
	if (roles.length === 0) return deferred.update({ content: translateKey(t, `${Root}:rolesListEmpty`) });

	const embed = new EmbedBuilder()
		.setColor(BrandingColors.Secondary)
		.setTitle(translateKey(t, `${Root}:rolesListTitle`))
		.setDescription(roles.join('\n').slice(0, MaximumDescriptionLength));
	return deferred.update({ embeds: [embed.toJSON()] });
}

/**
 * Claims (or unclaims) a public role for the author of the interaction, removing the roles of the same unique role set
 * and, when the guild asks for it, the initial roles.
 */
export async function claimPublicRole(interaction: GuildChatInputInteraction, role: TransformedArguments.Role, claim: boolean) {
	const t = getSupportedUserLanguageT(interaction);
	const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });

	const settings = await readSettings(interaction.guildId);
	const rolesPublic = settings.rolesPublic;
	if (rolesPublic.length === 0) return deferred.update({ content: translateKey(t, `${Root}:rolesListEmpty`) });

	if (!rolesPublic.includes(role.id)) {
		return deferred.update({ content: translateKey(t, `${Root}:rolesNotPublic`, { roles: role.name }) });
	}

	const guildId = interaction.guildId;
	const me = await container.gatewayClient.members.fetchMe(guildId);
	const highest = await me.roles.fetchHighest();
	if ((highest?.position ?? 0) <= role.position) {
		return deferred.update({ content: translateKey(t, `${Root}:rolesNotManageable`, { roles: role.name }) });
	}

	// Remove the everyone role
	const memberRoles = new Set(interaction.member.roles);
	memberRoles.delete(guildId);

	const hasRole = memberRoles.has(role.id);
	if (claim === hasRole) {
		return deferred.update({
			content: translateKey(t, claim ? `${Root}:rolesAlreadyClaimed` : `${Root}:rolesNotClaimed`, { roles: role.name })
		});
	}

	const removedRoles: string[] = [];
	const addedRoles: string[] = [];
	if (!claim) {
		memberRoles.delete(role.id);
		removedRoles.push(role.name);
	} else {
		memberRoles.add(role.id);
		addedRoles.push(role.name);

		const guildRoles = await container.gatewayClient.roles.fetchAll(guildId);
		const names = new Map(guildRoles.map((guildRole) => [guildRole.id, guildRole.name] as const));

		for (const set of settings.rolesUniqueRoleSets) {
			// If the set does not have the role being added skip to next set
			if (!set.roles.includes(role.id)) continue;

			for (const id of set.roles) {
				// If this role is the role being added skip
				if (role.id === id) continue;

				if (memberRoles.has(id)) {
					// If the member has this role we need to delete it
					memberRoles.delete(id);
					removedRoles.push(names.get(id) ?? id);
				}
			}
		}

		// If the guild requests to remove the initial role upon claiming, remove the initial role
		if (settings.rolesRemoveInitial) {
			const initial = new Set<string>([...settings.rolesInitial, ...settings.rolesInitialHumans]);
			const deleted = [...initial].filter((id) => !names.has(id));

			// If a role was deleted, remove it from the settings
			if (deleted.length > 0) {
				await writeSettings(guildId, {
					rolesInitial: settings.rolesInitial.filter((id: string) => names.has(id)),
					rolesInitialHumans: settings.rolesInitialHumans.filter((id: string) => names.has(id))
				}).catch((error: unknown) => container.logger.error(error));
			}

			for (const id of initial) memberRoles.delete(id);
		}
	}

	// Apply the roles
	const member = await container.gatewayClient.members.fetch(guildId, interaction.user.id);
	await member.roles.set([...memberRoles], translateKey(t, `${Root}:rolesAuditlog`));

	return deferred.update({ content: formatOutput(t, removedRoles, addedRoles) });
}

function formatOutput(t: TFunction, removedRoles: readonly string[], addedRoles: readonly string[]) {
	const output: string[] = [];
	if (removedRoles.length) output.push(translateKey(t, `${Root}:rolesRemoved`, { roles: removedRoles.join('`, `') }));
	if (addedRoles.length) output.push(translateKey(t, `${Root}:rolesAdded`, { roles: addedRoles.join('`, `') }));
	return output.join('\n');
}
