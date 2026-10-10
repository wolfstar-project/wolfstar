import { fetchGuildT } from '#lib/moderation/common/util';
import { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import { TypeVariation } from '#utils/moderationConstants';
import { isNullishOrEmpty } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';

export class ModerationActionSoftban extends ModerationAction<number, TypeVariation.Softban> {
	public constructor() {
		super({
			type: TypeVariation.Softban,
			isUndoActionAvailable: false,
			logPrefix: 'Moderation => Softban'
		});
	}

	protected override async handleApplyPost(guild: Guild, entry: ModerationAction.Entry, data: ModerationAction.Data<number>) {
		const t = await fetchGuildT(guild);

		const { api } = container.gatewayClient;
		await api.guilds.banUser(guild.id, entry.userId, { delete_message_seconds: data.context ?? 0 }, this.#getBanReason(t, entry.reason));
		await api.guilds.unbanUser(guild.id, entry.userId, this.#getUnbanReason(t, entry.reason));

		await this.completeLastModerationEntryFromUser({ guild, userId: entry.userId, type: TypeVariation.Ban });
	}

	#getBanReason(t: TFunction<AnyNamespace>, reason: string | null | undefined) {
		return {
			reason: isNullishOrEmpty(reason) ? t('moderationActions:softbanNoReason') : t('moderationActions:softbanReason', { reason })
		};
	}

	#getUnbanReason(t: TFunction<AnyNamespace>, reason: string | null | undefined) {
		return {
			reason: isNullishOrEmpty(reason) ? t('moderationActions:unSoftbanNoReason') : t('moderationActions:unSoftbanReason', { reason })
		};
	}
}
