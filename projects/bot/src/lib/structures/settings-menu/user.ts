import type { Translator } from '#lib/structures/commands/utils';
import { encodeSettingsMenuId } from '#lib/structures/settings-menu/ids';
import { renderSettingsExpiry } from '#lib/structures/settings-menu/render';
import {
	ButtonStyle,
	ComponentType,
	MessageFlags,
	type APIContainerComponent,
	type APIInteractionResponseCallbackData,
	type Snowflake
} from 'discord-api-types/v10';

const AccentColor = 0x5865f2;

export interface UserSettingsContext {
	/**
	 * The function to translate with.
	 */
	t: Translator;

	/**
	 * The user whose settings these are, the only one that can use the menu.
	 */
	ownerId: Snowflake;

	/**
	 * Whether the user receives the direct messages about the moderation actions taken on them.
	 */
	report: boolean;
}

/**
 * Renders the settings of a user: every setting shows its value next to the button that changes it.
 *
 * @remarks The message is ephemeral, so only the user sees it. It is the same one `/settings user` replies with and the
 * handler of the menu updates it with.
 */
export function renderUserSettings({ t, ownerId, report }: UserSettingsContext): Pick<APIInteractionResponseCallbackData, 'components' | 'flags'> {
	const container: APIContainerComponent = {
		type: ComponentType.Container,
		accent_color: AccentColor,
		components: [
			{ type: ComponentType.TextDisplay, content: `## ${t('commands/conf:menuUserTitle')}\n${t('commands/conf:menuUserSubtitle')}` },
			{ type: ComponentType.Separator },
			{
				type: ComponentType.Section,
				components: [
					{
						type: ComponentType.TextDisplay,
						content: `**${t('commands/conf:menuUserReport')}**\n${t(report ? 'commands/conf:menuValueEnabled' : 'commands/conf:menuValueDisabled')}\n-# ${t('commands/conf:menuUserReportDescription')}`
					}
				],
				accessory: {
					type: ComponentType.Button,
					custom_id: encodeSettingsMenuId({ ownerId, verb: 'userToggle', target: 'report', page: 0 }),
					style: report ? ButtonStyle.Secondary : ButtonStyle.Success,
					label: t(report ? 'commands/conf:menuUserDisable' : 'commands/conf:menuUserEnable')
				}
			}
		]
	};

	return { components: [container, renderSettingsExpiry(t)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}
