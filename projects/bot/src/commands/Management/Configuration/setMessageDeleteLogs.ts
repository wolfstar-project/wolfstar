import { ChannelConfigurationCommand } from '#lib/structures/commands';
import { RegisterCommand } from '@wolfstar/http-framework';

@RegisterCommand((builder) =>
	ChannelConfigurationCommand.applyBuilder(
		builder,
		'commands/management:setMessageDeleteLogs',
		'commands/management:setMessageDeleteLogsOptionsChannel'
	)
)
export class UserCommand extends ChannelConfigurationCommand {
	public constructor(context: ChannelConfigurationCommand.LoaderContext, options: ChannelConfigurationCommand.Options) {
		super(context, { ...options, responseKey: 'commands/management:setMessageDeleteLogsSet', settingsKey: 'logsMessageDelete' });
	}
}
