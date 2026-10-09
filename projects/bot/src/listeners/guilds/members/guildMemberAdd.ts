import { resolveOnErrorCodes, seconds, toErrorCodeResult } from '#common';
import { readSettings, writeSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import { Events } from '#lib/types';
import { Colors } from '#utils/constants';
import { getLogPrefix, getLogger, getStickyRoles, getUserMentionWithFlagsString } from '#utils/functions';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder, TimestampStyles, time } from '@discordjs/builders';
import { isNullish, type Nullish } from '@sapphire/utilities';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildMember, User } from '@wolfstar/plugin-gateway';
import { PermissionFlagsBits, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';

@RegisterAsGatewayListener('guildMemberAdd')
export class UserListener extends EventGatewayListener<'guildMemberAdd'> {
	public async run(member: GuildMember) {
		if (await this.#handleStickyRoles(member)) return;
		this.container.client.emit(Events.NotMutedMemberAdd, member);
	}

	async #handleStickyRoles(member: GuildMember) {
		const me = await this.container.gatewayClient.members.fetchMe(member.guildId);
		// Fetched, not read from the cache: the role that grants the permission may not be cached.
		if (!(await me.fetchPermissions()).has(PermissionFlagsBits.ManageRoles)) return false;

		const user = member.user ?? (await member.fetchUser());
		const stickyRoles = await (await getStickyRoles(member)).fetch(user.id);
		if (stickyRoles.length === 0) return false;

		// Handle the case the user is muted
		const settings = await readSettings(member);
		const mutedRoleId = settings.rolesMuted;
		const targetChannelId = settings.logsMemberAdd;
		if (mutedRoleId && stickyRoles.includes(mutedRoleId)) {
			void this.#handleMutedMemberAddRole(member, mutedRoleId);
			void this.#handleMutedMemberNotify(member, user, targetChannelId);

			return true;
		}

		void this.#handleStickyRolesAddRoles(member, stickyRoles);

		return false;
	}

	async #handleMutedMemberAddRole(member: GuildMember, mutedRoleId: Snowflake) {
		const { guildId } = member;
		const role = await resolveOnErrorCodes(this.container.gatewayClient.roles.fetch(guildId, mutedRoleId), RESTJSONErrorCodes.UnknownRole);
		if (isNullish(role)) {
			await writeSettings(guildId, { rolesMuted: null }, this.container.gatewayClient.user!.id);
		} else {
			const result = await toErrorCodeResult(member.roles.add(role));
			await result.inspectErrAsync((code) => this.#handleMutedMemberAddRoleErr(guildId, code));
		}
	}

	async #handleMutedMemberAddRoleErr(guildId: Snowflake, code: RESTJSONErrorCodes) {
		// The member left the guild before we could add the role, ignore:
		if (code === RESTJSONErrorCodes.UnknownMember) return;

		// The role was deleted, remove it from the settings:
		if (code === RESTJSONErrorCodes.UnknownRole) {
			await writeSettings(guildId, { rolesMuted: null }, this.container.gatewayClient.user!.id);
			return;
		}

		// Otherwise, log the error:
		this.container.logger.error(`${getLogPrefix(this)} Failed to add the muted role to a member.`);
	}

	async #handleMutedMemberNotify(member: GuildMember, user: User, targetChannelId: Snowflake | Nullish) {
		const logger = await getLogger(member);
		await logger.send({
			key: 'logsMemberAdd',
			channelId: targetChannelId,
			makeMessage: async () => {
				const t = await fetchGuildT({ id: member.guildId });
				const description = t('events/guilds-members:guildMemberAddDescription', {
					user: getUserMentionWithFlagsString(Number(user.flags.bitField), user.id),
					relativeTime: time(seconds.fromMilliseconds(user.createdTimestamp), TimestampStyles.RelativeTime)
				});
				return new EmbedBuilder()
					.setColor(Colors.Amber)
					.setAuthor(getFullEmbedAuthor(user))
					.setDescription(description)
					.setFooter({ text: t('events/guilds-members:guildMemberAddMute') })
					.setTimestamp();
			}
		});
	}

	async #handleStickyRolesAddRoles(member: GuildMember, stickyRoles: readonly Snowflake[]) {
		// The roles that no longer exist were already removed by `StickyRoleManager#fetch`:
		const result = await toErrorCodeResult(member.roles.add(stickyRoles));
		await result.inspectErrAsync((code) => this.#handleStickyRolesAddRolesErr(code));
	}

	#handleStickyRolesAddRolesErr(code: RESTJSONErrorCodes) {
		// The member left the guild before we could add the roles, ignore:
		if (code === RESTJSONErrorCodes.UnknownMember) return;

		// Otherwise, log the error:
		this.container.logger.error(`${getLogPrefix(this)} Failed to add the muted role to a member.`);
	}
}
