import { minutes } from '#utils/common';
import { PaginatedMessage, type PaginatedMessageOptions } from '@sapphire/discord.js-utilities';

export class WolfPaginatedMessage extends PaginatedMessage {
	public constructor(options: PaginatedMessageOptions = {}, idle = minutes(5)) {
		super(options);
		this.setIdle(idle);
	}
}
