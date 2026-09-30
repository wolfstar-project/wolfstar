import { fetchGuildT } from '#lib/moderation/common/util';
import { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import { resolveOnErrorCodes } from '#utils/common';
import { TypeVariation } from '#utils/moderationConstants';
import { isNullish } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';

export class ModerationActionSetNickname extends ModerationAction<string | null, TypeVariation.SetNickname> {
	public constructor() {
		super({
			type: TypeVariation.SetNickname,
			isUndoActionAvailable: true,
			logPrefix: 'Moderation => SetNickname'
		});
	}

	public override async isActive(guild: Guild, userId: string, context: string | null) {
		const member = await resolveOnErrorCodes(container.gatewayClient.members.fetch(guild.id, userId), RESTJSONErrorCodes.UnknownMember);
		return !isNullish(member) && member.nickname === context;
	}

	protected override async handleApplyPre(guild: Guild, entry: ModerationAction.Entry, data: ModerationAction.Data<string>) {
		const nickname = data.context || null;
		const t = await fetchGuildT(guild);
		const reason = entry.reason
			? t(nickname ? 'moderationActions:setNicknameSet' : 'moderationActions:setNicknameRemoved', { reason: entry.reason })
			: t(nickname ? 'moderationActions:setNicknameNoReasonSet' : 'moderationActions:setNicknameNoReasonRemoved');
		await container.gatewayClient.api.guilds.editMember(guild.id, entry.userId, { nick: nickname }, { reason });

		await this.completeLastModerationEntryFromUser({ guild, userId: entry.userId });
	}

	protected override async handleUndoPre(guild: Guild, entry: ModerationAction.Entry, data: ModerationAction.Data<string>) {
		const nickname = data.context || null;
		await container.gatewayClient.api.guilds.editMember(guild.id, entry.userId, { nick: nickname }, { reason: entry.reason || undefined });

		await this.completeLastModerationEntryFromUser({ guild, userId: entry.userId });
	}

	protected override async resolveOptionsExtraData(guild: Guild, options: ModerationAction.PartialOptions) {
		const userId = typeof options.user === 'string' ? options.user : options.user.id;
		const member = await container.gatewayClient.members.fetch(guild.id, userId);
		return { oldName: member.nickname };
	}
}
