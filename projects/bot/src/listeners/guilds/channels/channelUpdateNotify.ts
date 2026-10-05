import { readSettings } from '#lib/database';
import { createTranslator, type TranslationKey, type Translator } from '#lib/structures/commands/utils';
import { toPermissionsArray } from '#utils/bits';
import { seconds } from '#common';
import { differenceBitField, differenceMap } from '#common/comparators';
import { Colors, LongWidthSpace } from '#utils/constants';
import { getLogger } from '#utils/functions';
import { EmbedBuilder } from '@discordjs/builders';
import { isGuildBasedChannel, isNsfwChannel } from '@wolfstar/http-framework-utilities/gateway';
import { fetchT } from '@wolfstar/plugin-i18next';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type {
	AnnouncementChannel,
	AnyChannel,
	GuildBasedChannel,
	NonThreadGuildBasedChannel,
	PermissionOverwrites,
	StageChannel,
	TextChannel,
	VoiceChannel
} from '@wolfstar/plugin-gateway';
import { ChannelType, OverwriteType } from 'discord-api-types/v10';

@RegisterAsGatewayListener('channelUpdate')
export class UserListener extends EventGatewayListener<'channelUpdate'> {
	public async run(old: AnyChannel | null, updated: AnyChannel) {
		// The channel was not cached, there is nothing to compare it with:
		if (old === null) return;
		if (!isGuildBasedChannel(updated)) return;

		const previous = old as GuildBasedChannel;
		const next = updated as GuildBasedChannel;

		const settings = await readSettings(next.guildId);
		const logger = await getLogger(next.guildId);
		await logger.send({
			key: 'logsChannelUpdate',
			channelId: settings.logsChannelUpdate,
			makeMessage: async () => {
				const t = createTranslator(await fetchT(logger.guild));
				const changes: string[] = [...this.differenceChannel(t, previous, next)];
				if (changes.length === 0) return null;

				return new EmbedBuilder()
					.setColor(Colors.Yellow)
					.setAuthor({ name: `${next.name} (${next.id})`, iconURL: logger.guild.iconURL({ size: 64, extension: 'png' }) ?? undefined })
					.setDescription(changes.join('\n'))
					.setFooter({ text: t('events/guilds-logs:channelUpdate') })
					.setTimestamp();
			}
		});
	}

	private *differenceChannel(t: Translator, previous: GuildBasedChannel, next: GuildBasedChannel) {
		yield* this.differenceGuildChannel(t, previous, next);

		const isThread = next.isThread();
		if (!isThread) {
			yield* this.differencePositions(t, previous as NonThreadGuildBasedChannel, next as NonThreadGuildBasedChannel);
		}

		if (previous.type !== next.type) return;

		switch (next.type) {
			case ChannelType.GuildText:
				yield* this.differenceTextChannel(t, previous as TextChannel, next as TextChannel);
				break;
			case ChannelType.GuildStageVoice:
			case ChannelType.GuildVoice:
				yield* this.differenceVoiceChannel(t, previous as StageChannel | VoiceChannel, next as StageChannel | VoiceChannel);
				break;
			case ChannelType.GuildAnnouncement:
				yield* this.differenceNewsChannel(t, previous as AnnouncementChannel, next as AnnouncementChannel);
				break;
			default:
			// No Op
		}

		if (!isThread) {
			yield* this.differencePermissionOverwrites(t, previous as NonThreadGuildBasedChannel, next as NonThreadGuildBasedChannel);
		}
	}

	private *differenceGuildChannel(t: Translator, previous: GuildBasedChannel, next: GuildBasedChannel) {
		if (previous.name !== next.name) {
			yield t('events/guilds-logs:channelUpdateName', { previous: previous.name, next: next.name });
		}

		const previousParentId = this.getParentId(previous);
		const nextParentId = this.getParentId(next);
		if (previousParentId !== nextParentId) {
			if (previousParentId === null) {
				yield t('events/guilds-logs:channelUpdateParentAdded', { value: `<#${nextParentId}>` });
			} else if (nextParentId === null) {
				yield t('events/guilds-logs:channelUpdateParentRemoved', { value: `<#${previousParentId}>` });
			} else {
				yield t('events/guilds-logs:channelUpdateParent', { previous: `<#${previousParentId}>`, next: `<#${nextParentId}>` });
			}
		}

		if (previous.type !== next.type) {
			yield t('events/guilds-logs:channelUpdateType', { previous: previous.type, next: next.type });
		}
	}

	private *differencePositions(t: Translator, previous: NonThreadGuildBasedChannel, next: NonThreadGuildBasedChannel) {
		if (previous.position !== next.position) {
			yield t('events/guilds-logs:channelUpdatePosition', { previous: previous.position, next: next.position });
		}
	}

	private *differencePermissionOverwrites(t: Translator, previous: NonThreadGuildBasedChannel, next: NonThreadGuildBasedChannel) {
		// The overwrites are kept in an array, they are compared by the ID of the role or member they are for:
		const previousPermissions = new Map(previous.permissionOverwrites.cache.map((overwrite) => [overwrite.id, overwrite]));
		const nextPermissions = new Map(next.permissionOverwrites.cache.map((overwrite) => [overwrite.id, overwrite]));

		const difference = differenceMap(previousPermissions, nextPermissions);
		for (const added of difference.added.values()) {
			const allow = added.allow.bitField;
			const deny = added.deny.bitField;
			if (allow === 0n && deny === 0n) continue;

			const mention = this.displayMention(added, next.guildId);
			yield t('events/guilds-logs:channelUpdateAddedPermissionsTitle', { value: mention });
			if (allow !== 0n) {
				const values = toPermissionsArray(allow).map((value) => t(`permissions:${value}` as TranslationKey));
				yield LongWidthSpace + t('events/guilds-logs:channelCreatePermissionsAllow', { values, count: values.length });
			}

			if (deny !== 0n) {
				const values = toPermissionsArray(deny).map((value) => t(`permissions:${value}` as TranslationKey));
				yield LongWidthSpace + t('events/guilds-logs:channelCreatePermissionsDeny', { values, count: values.length });
			}
		}

		for (const removed of difference.removed.values()) {
			const allow = removed.allow.bitField;
			const deny = removed.deny.bitField;
			if (allow === 0n && deny === 0n) continue;

			const mention = this.displayMention(removed, next.guildId);
			yield t('events/guilds-logs:channelUpdateDeletedPermissionsTitle', { value: mention });
		}

		for (const [previousPermission, nextPermission] of difference.updated.values()) {
			const previousAllow = previousPermission.allow.bitField;
			const nextAllow = nextPermission.allow.bitField;
			const sameAllow = previousAllow === nextAllow;

			const previousDeny = previousPermission.deny.bitField;
			const nextDeny = nextPermission.deny.bitField;
			const sameDeny = previousDeny === nextDeny;

			if (sameAllow && sameDeny) continue;

			const mention = this.displayMention(nextPermission, next.guildId);
			yield t('events/guilds-logs:channelUpdatePermissionsTitle', { value: mention });
			if (!sameAllow) {
				const modified = differenceBitField(previousAllow, nextAllow);
				if (modified.added !== 0n) {
					const values = toPermissionsArray(modified.added).map((value) => t(`permissions:${value}` as TranslationKey));
					yield LongWidthSpace + t('events/guilds-logs:channelUpdateAddedPermissionsAllow', { values, count: values.length });
				}

				if (modified.removed !== 0n) {
					const values = toPermissionsArray(modified.removed).map((value) => t(`permissions:${value}` as TranslationKey));
					yield LongWidthSpace + t('events/guilds-logs:channelUpdateRemovedPermissionsAllow', { values, count: values.length });
				}
			}

			if (!sameDeny) {
				const modified = differenceBitField(previousDeny, nextDeny);
				if (modified.added !== 0n) {
					const values = toPermissionsArray(modified.added).map((value) => t(`permissions:${value}` as TranslationKey));
					yield LongWidthSpace + t('events/guilds-logs:channelUpdateAddedPermissionsDeny', { values, count: values.length });
				}

				if (modified.removed !== 0n) {
					const values = toPermissionsArray(modified.removed).map((value) => t(`permissions:${value}` as TranslationKey));
					yield LongWidthSpace + t('events/guilds-logs:channelUpdateRemovedPermissionsDeny', { values, count: values.length });
				}
			}
		}
	}

	private *differenceTextChannel(t: Translator, previous: TextChannel, next: TextChannel) {
		if (isNsfwChannel(previous) !== isNsfwChannel(next)) yield this.displayNsfw(t, isNsfwChannel(previous), isNsfwChannel(next));
		yield* this.differenceTopic(t, previous, next);

		const previousRateLimitPerUser = previous.rateLimitPerUser ?? 0;
		const nextRateLimitPerUser = next.rateLimitPerUser ?? 0;
		if (previousRateLimitPerUser !== nextRateLimitPerUser) {
			yield this.displayRateLimitPerUser(t, previousRateLimitPerUser, nextRateLimitPerUser);
		}
	}

	private *differenceVoiceChannel(t: Translator, previous: StageChannel | VoiceChannel, next: StageChannel | VoiceChannel) {
		if (previous.bitrate !== next.bitrate) yield this.displayBitrate(t, previous.bitrate, next.bitrate);
		if (previous.userLimit !== next.userLimit) yield this.displayUserLimit(t, previous.userLimit, next.userLimit);
	}

	private *differenceNewsChannel(t: Translator, previous: AnnouncementChannel, next: AnnouncementChannel) {
		if (isNsfwChannel(previous) !== isNsfwChannel(next)) yield this.displayNsfw(t, isNsfwChannel(previous), isNsfwChannel(next));
		yield* this.differenceTopic(t, previous, next);
	}

	private *differenceTopic(t: Translator, previous: AnnouncementChannel | TextChannel, next: AnnouncementChannel | TextChannel) {
		// A channel without a topic may have it missing instead of set to null:
		const previousTopic = previous.topic ?? null;
		const nextTopic = next.topic ?? null;
		if (previousTopic !== nextTopic) yield this.displayTopic(t, previousTopic, nextTopic);
	}

	/**
	 * Gets the ID of the category (or of the channel, for a thread) a channel is in, a category has none.
	 */
	private getParentId(channel: GuildBasedChannel): string | null {
		return 'parentId' in channel ? (channel.parentId ?? null) : null;
	}

	private displayNsfw(t: Translator, previous: boolean, next: boolean) {
		return t('events/guilds-logs:channelUpdateNsfw', {
			previous: t(previous ? 'globals:yes' : 'globals:no'),
			next: t(next ? 'globals:yes' : 'globals:no')
		});
	}

	private displayTopic(t: Translator, previous: string | null, next: string | null) {
		if (previous === null) return t('events/guilds-logs:channelUpdateTopicAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:channelUpdateTopicRemoved', { value: previous });
		return t('events/guilds-logs:channelUpdateTopic', { previous, next });
	}

	private displayRateLimitPerUser(t: Translator, previous: number, next: number) {
		if (previous === 0) return t('events/guilds-logs:channelUpdateRateLimitAdded', { value: seconds(next) });
		if (next === 0) return t('events/guilds-logs:channelUpdateRateLimitRemoved', { value: seconds(previous) });
		return t('events/guilds-logs:channelUpdateRateLimit', { previous: seconds(previous), next: seconds(next) });
	}

	private displayBitrate(t: Translator, previous: number, next: number) {
		return t('events/guilds-logs:channelUpdateBitrate', { previous: previous / 1000, next: next / 1000 });
	}

	private displayUserLimit(t: Translator, previous: number, next: number) {
		if (previous === 0) return t('events/guilds-logs:channelUpdateUserLimitAdded', { value: next });
		if (next === 0) return t('events/guilds-logs:channelUpdateUserLimitRemoved', { value: previous });
		return t('events/guilds-logs:channelUpdateUserLimit', { previous, next });
	}

	private displayMention(permissions: PermissionOverwrites, guildId: string) {
		if (permissions.type === OverwriteType.Member) return `<@${permissions.id}>`;
		if (permissions.id === guildId) return '@everyone';
		return `<@&${permissions.id}>`;
	}
}
