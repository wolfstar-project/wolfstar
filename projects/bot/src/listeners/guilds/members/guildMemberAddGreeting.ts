import { readSettings } from '#lib/database';
import { formatGreeting, pickGreeting } from '#lib/greetings/format';
import { sendGreeting } from '#lib/greetings/send';
import { getLogPrefix } from '#utils/functions';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { GuildMember } from '@wolfstar/plugin-gateway';

/**
 * Greets a member who joins with one of the join messages of the server (`greetings.join-messages`), at random, in
 * `greetings.join-channel` or in a direct message with `greetings.join-direct`.
 */
@RegisterAsGatewayListener('guildMemberAdd')
export class UserListener extends EventGatewayListener<'guildMemberAdd'> {
	public async run(member: GuildMember) {
		const settings = await readSettings(member.guildId);
		const template = pickGreeting(settings.greetingsJoinMessages);
		if (template === null) return;
		if (!settings.greetingsJoinDirect && settings.greetingsJoinChannel === null) return;

		try {
			const user = member.user ?? (await member.fetchUser());
			const guild = member.guild ?? (await member.fetchGuild());
			const content = formatGreeting(template, { user, guild });

			if (settings.greetingsJoinDirect) {
				// A member who does not take direct messages is not greeted, which is not an error:
				await user.send({ content, allowed_mentions: { parse: [] } }).catch(() => null);
				return;
			}

			await sendGreeting(settings.greetingsJoinChannel!, content, user.id);
		} catch (error) {
			this.container.logger.error(getLogPrefix(this), 'Could not greet a member who joined:', error);
		}
	}
}
