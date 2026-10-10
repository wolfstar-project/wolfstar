import { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import { resolveOnErrorCodes } from '#common';
import { TypeVariation } from '#utils/moderationConstants';
import { isNullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { Guild, Role } from '@wolfstar/plugin-gateway';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';

export class ModerationActionRoleRemove extends ModerationAction<Pick<Role, 'id'>, TypeVariation.RoleRemove> {
	public constructor() {
		super({
			type: TypeVariation.RoleRemove,
			isUndoActionAvailable: true,
			logPrefix: 'Moderation => RoleRemove'
		});
	}

	public override async isActive(guild: Guild, userId: string, context: Pick<Role, 'id'>) {
		const member = await resolveOnErrorCodes(container.gatewayClient.members.fetch(guild.id, userId), RESTJSONErrorCodes.UnknownMember);
		return !isNullish(member) && !member.roleIds.includes(context.id);
	}

	protected override async handleApplyPre(guild: Guild, entry: ModerationAction.Entry, data: ModerationAction.Data<Pick<Role, 'id'>>) {
		const role = data.context!;
		await container.gatewayClient.api.guilds.removeRoleFromMember(guild.id, entry.userId, role.id, {
			reason: await this.getReason(guild, entry.reason)
		});

		await this.completeLastModerationEntryFromUser({
			guild,
			userId: entry.userId,
			filter: (log) => log.extraData?.role === role.id
		});
	}

	protected override async handleUndoPre(guild: Guild, entry: ModerationAction.Entry, data: ModerationAction.Data<Pick<Role, 'id'>>) {
		const role = data.context!;
		await container.gatewayClient.api.guilds.addRoleToMember(guild.id, entry.userId, role.id, { reason: entry.reason ?? undefined });

		await this.completeLastModerationEntryFromUser({
			guild,
			userId: entry.userId,
			filter: (log) => log.extraData?.role === role.id
		});
	}

	protected override resolveOptionsExtraData(
		_guild: Guild,
		_options: ModerationAction.PartialOptions,
		data: ModerationAction.Data<Pick<Role, 'id'>>
	) {
		return { role: data.context!.id };
	}
}
