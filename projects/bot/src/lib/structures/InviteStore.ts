import { minutes, resolveOnErrorCodes } from '#common';
import { Collection } from '@discordjs/collection';
import { container } from '@wolfstar/http-framework';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';

export class InviteStore extends Collection<string, InviteCodeEntry> {
	private readonly interval = setInterval(() => {
		const deleteAt = Date.now() - minutes(15);
		this.sweep((value) => value.fetchedAt < deleteAt);
	}, minutes(1)).unref();

	public destroy() {
		clearInterval(this.interval);
	}

	public async fetch(code: string) {
		const previous = this.get(code);
		if (typeof previous !== 'undefined') return previous;

		const data = await resolveOnErrorCodes(container.gatewayClient.api.invites.get(code), RESTJSONErrorCodes.UnknownInvite);
		if (data === null) {
			const resolved: InviteCodeEntry = { valid: false, fetchedAt: Date.now() };
			this.set(code, resolved);
			return resolved;
		}

		const resolved: InviteCodeEntry = {
			valid: true,
			code,
			guildId: data.guild?.id ?? null,
			fetchedAt: Date.now()
		};
		this.set(code, resolved);
		return resolved;
	}
}

export type InviteCodeEntry = (InviteCodeInvalidEntry | InviteCodeValidEntry) & {
	fetchedAt: number;
};

export interface InviteCodeInvalidEntry {
	valid: false;
}

export interface InviteCodeValidEntry {
	valid: true;
	code: string;
	guildId: string | null;
}
