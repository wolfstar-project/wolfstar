import { AdderKey, configurableKeys, GuildEntity, readSettings, writeSettings } from '#lib/database';
import { WolfCommand } from '#lib/structures';
import type { GuildMessage } from '#lib/types';
import { PermissionLevels } from '#lib/types/Enums';
import { CommandOptionsRunTypeEnum, PieceContext } from '@sapphire/framework';
import { send } from '@sapphire/plugin-editable-commands';
import { codeBlock, PickByValue } from '@sapphire/utilities';
import type { TFunction } from 'i18next';
import { SelfModeratorBitField, SelfModeratorHardActionFlags } from './SelfModeratorBitField';

export enum AKeys {
	Enable,
	Disable,
	SoftAction,
	HardAction,
	HardActionDuration,
	ThresholdMaximum,
	ThresholdDuration,
	Show
}

export const kActions = new Map<string, AKeys>([
	['e', AKeys.Enable],
	['enable', AKeys.Enable],
	['on', AKeys.Enable],
	['d', AKeys.Disable],
	['disable', AKeys.Disable],
	['off', AKeys.Disable],
	['a', AKeys.SoftAction],
	['action', AKeys.SoftAction],
	['soft-action', AKeys.SoftAction],
	['p', AKeys.HardAction],
	['punish', AKeys.HardAction],
	['punishment', AKeys.HardAction],
	['pd', AKeys.HardActionDuration],
	['punish-duration', AKeys.HardActionDuration],
	['punishment-duration', AKeys.HardActionDuration],
	['t', AKeys.ThresholdMaximum],
	['tm', AKeys.ThresholdMaximum],
	['threshold', AKeys.ThresholdMaximum],
	['threshold-maximum', AKeys.ThresholdMaximum],
	['td', AKeys.ThresholdDuration],
	['threshold-duration', AKeys.ThresholdDuration],
	['s', AKeys.Show],
	['sh', AKeys.Show],
	['show', AKeys.Show],
	['display', AKeys.Show]
]);

export enum ASKeys {
	Alert = SelfModeratorBitField.FLAGS.ALERT,
	Log = SelfModeratorBitField.FLAGS.LOG,
	Delete = SelfModeratorBitField.FLAGS.DELETE
}

export const kSoftActions = new Map<string, ASKeys>([
	['a', ASKeys.Alert],
	['al', ASKeys.Alert],
	['alert', ASKeys.Alert],
	['l', ASKeys.Log],
	['log', ASKeys.Log],
	['d', ASKeys.Delete],
	['del', ASKeys.Delete],
	['delete', ASKeys.Delete]
]);

export const kHardActions = new Map<string, SelfModeratorHardActionFlags>([
	['r', SelfModeratorHardActionFlags.None],
	['reset', SelfModeratorHardActionFlags.None],
	['n', SelfModeratorHardActionFlags.None],
	['none', SelfModeratorHardActionFlags.None],
	['w', SelfModeratorHardActionFlags.Warning],
	['warn', SelfModeratorHardActionFlags.Warning],
	['warning', SelfModeratorHardActionFlags.Warning],
	['m', SelfModeratorHardActionFlags.Mute],
	['mute', SelfModeratorHardActionFlags.Mute],
	['k', SelfModeratorHardActionFlags.Kick],
	['kick', SelfModeratorHardActionFlags.Kick],
	['sb', SelfModeratorHardActionFlags.SoftBan],
	['softban', SelfModeratorHardActionFlags.SoftBan],
	['soft-ban', SelfModeratorHardActionFlags.SoftBan],
	['b', SelfModeratorHardActionFlags.Ban],
	['ban', SelfModeratorHardActionFlags.Ban]
]);

export abstract class SelfModerationCommand extends WolfCommand {
	protected constructor(context: PieceContext, options: SelfModerationCommand.Options) {
		super(context, {
			permissionLevel: PermissionLevels.Administrator,
			runIn: [CommandOptionsRunTypeEnum.GuildAny],
			...options
		});
	}

	public async messageRun(message: GuildMessage, args: WolfCommand.Args) {
		const type = this.getAction(args);
		if (type === AKeys.Show) return this.show(message);

		let value = (await this.getValue(args, type)) as unknown;

		const key = this.getProperty(type)!;
		const t = await writeSettings(message.guild, (settings) => {
			Reflect.set(settings, key, value);
			return settings.getLanguage();
		});

		switch (type) {
			case AKeys.SoftAction: {
				value = SelfModerationCommand.displaySoftAction(t, value as number).join('`, `');
				break;
			}
			case AKeys.HardAction: {
				value = t(SelfModerationCommand.displayHardAction(value as SelfModeratorHardActionFlags));
				break;
			}
			case AKeys.Enable:
			case AKeys.Disable:
			case AKeys.ThresholdMaximum:
			case AKeys.ThresholdDuration:
			case AKeys.HardActionDuration:
				break;
		}

		const content = SelfModerationCommand.getLanguageKey(t, type, value);
		return send(message, content);
	}

	protected async show(message: GuildMessage) {
		const [enabled, softAction, hardAction, hardActionDuration, adder, t] = await readSettings(message.guild, (settings) => [
			settings[this.keyEnabled],
			settings[this.keySoftAction],
			settings[this.keyHardAction],
			settings[this.keyHardActionDuration],
			settings.adders[this.$adder],
			settings.getLanguage()
		]);

		const [yes, no] = [t('arguments:booleanEnabled'), t('arguments:booleanDisabled')];
		const codeBlockContent = t('selfModeration:commandShow', {
			kEnabled: enabled ? yes : no,
			kAlert: SelfModerationCommand.has(softAction, ASKeys.Alert) ? yes : no,
			kLog: SelfModerationCommand.has(softAction, ASKeys.Log) ? yes : no,
			kDelete: SelfModerationCommand.has(softAction, ASKeys.Delete) ? yes : no,
			kHardAction: t(SelfModerationCommand.displayHardAction(hardAction)),
			hardActionDurationText: hardActionDuration
				? t('globals:durationValue', { value: hardActionDuration })
				: t('selfModeration:commandShowDurationPermanent'),
			thresholdMaximumText: adder?.maximum ? adder.maximum : t('selfModeration:commandShowUnset'),
			thresholdDurationText: adder?.duration ? t('globals:durationValue', { value: adder.duration }) : t('selfModeration:commandShowUnset'),
			joinArrays: '\n'
		});
		const content = codeBlock('prolog', codeBlockContent);
		return send(message, content);
	}

	private getAction(args: WolfCommand.Args) {
		if (args.finished) return AKeys.Show;

		const action = kActions.get(args.next().toLowerCase());
		if (typeof action === 'undefined') {
			return this.error('selfModeration:commandInvalidMissingAction', { name: this.name });
		}

		return action;
	}

	private async getValue(args: WolfCommand.Args, type: AKeys) {
		if (type === AKeys.Enable) return true;
		if (type === AKeys.Disable) return false;
		if (type === AKeys.Show) return null;
		if (args.finished) this.error('selfModeration:commandInvalidMissingArguments', { name: this.name });

		if (type === AKeys.SoftAction) {
			const softAction = kSoftActions.get(args.next().toLowerCase());
			if (typeof softAction === 'undefined') {
				this.error('selfModeration:commandInvalidSoftaction', { name: this.name });
			}

			const previousSoftAction = await readSettings(args.message.guild!, this.keySoftAction);
			return SelfModerationCommand.toggle(previousSoftAction, softAction);
		}

		if (type === AKeys.HardAction) {
			const hardAction = kHardActions.get(args.next().toLowerCase());
			if (typeof hardAction === 'undefined') {
				this.error('selfModeration:commandInvalidHardaction', { name: this.name });
			}

			return hardAction;
		}

		if (type === AKeys.HardActionDuration) {
			const key = configurableKeys.get(this.keyHardActionDuration)!;
			return args.pick('timespan', { minimum: key.minimum, maximum: key.maximum });
		}

		if (type === AKeys.ThresholdMaximum) {
			const key = configurableKeys.get(this.keyThresholdMaximum)!;
			return args.pick('integer', { minimum: key.minimum, maximum: key.maximum });
		}

		if (type === AKeys.ThresholdDuration) {
			const key = configurableKeys.get(this.keyThresholdDuration)!;
			return args.pick('timespan', { minimum: key.minimum, maximum: key.maximum });
		}

		throw new Error('Unreachable');
	}

	private getProperty(action: AKeys) {
		switch (action) {
			case AKeys.Enable:
			case AKeys.Disable:
				return this.keyEnabled;
			case AKeys.SoftAction:
				return this.keySoftAction;
			case AKeys.HardAction:
				return this.keyHardAction;
			case AKeys.HardActionDuration:
				return this.keyHardActionDuration;
			case AKeys.ThresholdMaximum:
				return this.keyThresholdMaximum;
			case AKeys.ThresholdDuration:
				return this.keyThresholdDuration;
			default:
				throw new Error('Unexpected.');
		}
	}

	private static displaySoftAction(t: TFunction, softAction: number) {
		const actions: string[] = [];
		if (SelfModerationCommand.has(softAction, ASKeys.Alert)) actions.push(t('selfModeration:softActionAlert'));
		if (SelfModerationCommand.has(softAction, ASKeys.Log)) actions.push(t('selfModeration:softActionLog'));
		if (SelfModerationCommand.has(softAction, ASKeys.Delete)) actions.push(t('selfModeration:softActionDelete'));
		return actions;
	}

	private static getLanguageKey(t: TFunction, action: AKeys, value: unknown) {
		switch (action) {
			case AKeys.Enable:
				return t('selfModeration:commandEnabled');
			case AKeys.Disable:
				return t('selfModeration:commandDisabled');
			case AKeys.SoftAction: {
				return value ? t('selfModeration:commandSoftActionWithValue', { value: value as string }) : t('selfModeration:commandSoftAction');
			}
			case AKeys.HardAction:
				return t('selfModeration:commandHardAction', { value: value as string });
			case AKeys.HardActionDuration: {
				return value
					? t('selfModeration:commandHardActionDurationWithValue', { value: value as number })
					: t('selfModeration:commandHardActionDuration');
			}
			case AKeys.ThresholdMaximum: {
				return value
					? t('selfModeration:commandThresholdMaximumWithValue', { value: value as number })
					: t('selfModeration:commandThresholdMaximum');
			}
			case AKeys.ThresholdDuration: {
				return value
					? t('selfModeration:commandThresholdDurationWithValue', { value: value as number })
					: t('selfModeration:commandThresholdDuration');
			}
			default:
				throw new Error('Unexpected.');
		}
	}

	private static displayHardAction(hardAction: SelfModeratorHardActionFlags | null) {
		switch (hardAction) {
			case SelfModeratorHardActionFlags.Ban:
				return 'selfModeration:hardActionBan';
			case SelfModeratorHardActionFlags.Kick:
				return 'selfModeration:hardActionKick';
			case SelfModeratorHardActionFlags.Mute:
				return 'selfModeration:hardActionMute';
			case SelfModeratorHardActionFlags.SoftBan:
				return 'selfModeration:hardActionSoftban';
			case SelfModeratorHardActionFlags.Warning:
				return 'selfModeration:hardActionWarning';
			default:
				return 'selfModeration:hardActionNone';
		}
	}

	private static has(bitfields: number, bitfield: number) {
		return (bitfields & bitfield) === bitfield;
	}

	private static toggle(bitfields: number, bitfield: number) {
		return SelfModerationCommand.has(bitfields, bitfield) ? bitfields & ~bitfield : bitfields | bitfield;
	}

	protected abstract $adder: AdderKey;
	protected abstract keyEnabled: PickByValue<GuildEntity, boolean>;
	protected abstract keySoftAction: PickByValue<GuildEntity, number>;
	protected abstract keyHardAction: PickByValue<GuildEntity, number | null>;
	protected abstract keyHardActionDuration: PickByValue<GuildEntity, number | null>;
	protected abstract keyThresholdMaximum: PickByValue<GuildEntity, number | null>;
	protected abstract keyThresholdDuration: PickByValue<GuildEntity, number | null>;
}

export namespace SelfModerationCommand {
	/**
	 * The SelfModerationCommand Options
	 */
	export type Options = WolfCommand.Options;

	export type Args = WolfCommand.Args;
}
