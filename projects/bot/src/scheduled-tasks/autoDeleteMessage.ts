import { resolveOnErrorCodes } from '#common';
import { readSettings } from '#lib/database';
import { ScheduledTask } from '@wolfstar/plugin-scheduled-tasks';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';

export interface AutoDeleteMessagePayload {
	/**
	 * The guild of the channel, which the jobs made before `modules.autodelete` existed do not have.
	 */
	guildId?: string;
	channelId: string;
	messageId: string;
}

/**
 * The errors that mean there is nothing left to delete, or that the bot can no longer do it.
 */
const IgnoredCodes = [
	RESTJSONErrorCodes.UnknownMessage,
	RESTJSONErrorCodes.UnknownChannel,
	RESTJSONErrorCodes.MissingAccess,
	RESTJSONErrorCodes.MissingPermissions
] as const;

/**
 * Deletes a message of a channel whose messages are deleted after a delay, see the `messageCreateAutoDelete` listener.
 * A message that was pinned in the meantime is kept, and so is every message while `modules.autodelete` is off.
 */
export class UserTask extends ScheduledTask<'autoDeleteMessage'> {
	public override async run({ guildId, channelId, messageId }: AutoDeleteMessagePayload) {
		if (guildId !== undefined && !(await readSettings(guildId)).modulesAutodelete) return null;

		const { api, messages } = this.container.gatewayClient;

		const message = await resolveOnErrorCodes(api.channels.getMessage(channelId, messageId), ...IgnoredCodes);
		if (message === null || message.pinned) return null;

		await resolveOnErrorCodes(messages.delete(channelId, messageId, 'Auto delete'), ...IgnoredCodes);
		return null;
	}
}

declare module '@wolfstar/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		autoDeleteMessage: AutoDeleteMessagePayload;
	}
}
