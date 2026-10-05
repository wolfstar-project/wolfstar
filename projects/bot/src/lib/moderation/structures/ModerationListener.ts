import { readSettings } from '#lib/database';
import { ModerationActions } from '#lib/moderation/actions/index';
import { AutoModerationOnInfraction } from '#lib/moderation/structures/AutoModerationOnInfraction';
import type { HardPunishment, ModerationMessageListener } from '#lib/moderation/structures/ModerationMessageListener';
import { days, seconds } from '#common';
import { getModeration } from '#utils/functions';
import { isNullishOrZero, type Awaitable } from '@sapphire/utilities';
import { Listener } from '@wolfstar/http-framework';
import type { Guild } from '@wolfstar/plugin-gateway';
import type { AutoModerationHardAction, GuildSettingsOfType } from 'wolfstar-database';

export abstract class ModerationListener<V extends unknown[], T = unknown> extends Listener {
	public abstract override run(...params: V): unknown;

	protected processSoftPunishment(args: Readonly<V>, preProcessed: T, bitfield: number) {
		if (AutoModerationOnInfraction.has(bitfield, AutoModerationOnInfraction.flags.Delete)) this.onDelete(args, preProcessed);
		if (AutoModerationOnInfraction.has(bitfield, AutoModerationOnInfraction.flags.Alert)) this.onAlert(args, preProcessed);
		if (AutoModerationOnInfraction.has(bitfield, AutoModerationOnInfraction.flags.Log)) this.onLog(args, preProcessed);
	}

	protected async processHardPunishment(guild: Guild, userId: string, action: AutoModerationHardAction) {
		switch (action) {
			case 'Warning':
				await this.onWarning(guild, userId);
				break;
			case 'Kick':
				await this.onKick(guild, userId);
				break;
			case 'Timeout':
				await this.onTimeout(guild, userId);
				break;
			case 'Softban':
				await this.onSoftBan(guild, userId);
				break;
			case 'Ban':
				await this.onBan(guild, userId);
				break;
			case 'VoiceKick':
				await this.onVoiceKick(guild, userId);
				break;
		}
	}

	protected async onWarning(guild: Guild, userId: string) {
		const duration = await this.#getPunishmentActionDuration(guild);
		await this.createActionAndSend(guild, () =>
			ModerationActions.warning.apply(guild, { user: userId, reason: '[Auto-Moderation] Threshold Reached.', duration })
		);
	}

	protected async onKick(guild: Guild, userId: string) {
		await this.createActionAndSend(guild, () =>
			ModerationActions.kick.apply(guild, { user: userId, reason: '[Auto-Moderation] Threshold Reached.' })
		);
	}

	protected async onTimeout(guild: Guild, userId: string) {
		const duration = await this.#getPunishmentActionDuration(guild);
		if (isNullishOrZero(duration)) return;

		await this.createActionAndSend(guild, () =>
			ModerationActions.timeout.apply(guild, {
				user: userId,
				reason: '[Auto-Moderation] Threshold Reached.',
				duration: Math.min(Number(duration), days(28))
			})
		);
	}

	protected async onSoftBan(guild: Guild, userId: string) {
		await this.createActionAndSend(guild, () =>
			ModerationActions.softban.apply(
				guild,
				{ user: userId, reason: '[Auto-Moderation] Threshold Reached.' },
				{ context: seconds.fromMinutes(5) }
			)
		);
	}

	protected async onBan(guild: Guild, userId: string) {
		const duration = await this.#getPunishmentActionDuration(guild);
		await this.createActionAndSend(guild, () =>
			ModerationActions.ban.apply(guild, { user: userId, reason: '[Auto-Moderation] Threshold Reached.', duration })
		);
	}

	protected async onVoiceKick(guild: Guild, userId: string) {
		await this.createActionAndSend(guild, () =>
			ModerationActions.voiceKick.apply(guild, { user: userId, reason: '[Auto-Moderation] Threshold Reached.' })
		);
	}

	protected async createActionAndSend(guild: Guild, performAction: () => unknown): Promise<void> {
		const unlock = (await getModeration(guild)).createLock();
		await performAction();
		unlock();
	}

	protected abstract keyEnabled: GuildSettingsOfType<boolean>;
	protected abstract softPunishmentPath: GuildSettingsOfType<number>;
	protected abstract hardPunishmentPath: HardPunishment;
	protected abstract preProcess(args: Readonly<V>): Awaitable<T | null>;
	protected abstract onLog(args: Readonly<V>, value: T): unknown;
	protected abstract onDelete(args: Readonly<V>, value: T): unknown;
	protected abstract onAlert(args: Readonly<V>, value: T): unknown;
	protected abstract onLogMessage(args: Readonly<V>, value: T): Awaitable<ModerationMessageListener.LogMessage>;

	async #getPunishmentActionDuration(guild: Guild) {
		const settings = await readSettings(guild);
		return settings[this.hardPunishmentPath.actionDuration];
	}
}

export namespace ModerationListener {
	export type Options = Listener.Options;
	export type JSON = Listener.JSON;
	export type LoaderContext = Listener.LoaderContext;
}
