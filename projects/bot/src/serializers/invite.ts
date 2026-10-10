import { Serializer } from '#lib/database';
import { Routes, type RESTGetAPIInviteResult } from 'discord-api-types/v10';

const InvitePattern = /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)?([\w-]{2,})$/i;

export class UserSerializer extends Serializer<string> {
	public async parse(input: string, { t, entry }: Serializer.UpdateContext) {
		const code = InvitePattern.exec(input.trim())?.[1];
		if (code && (await this.fetchInvite(code)) !== null) return this.ok(code);
		return this.error(t('serializers:invalidInvite', { name: entry.name }));
	}

	public async isValid(value: string, { t, entry }: Serializer.UpdateContext): Promise<boolean> {
		const invite = await this.fetchInvite(value);
		if (invite === null || !invite.guild) throw t('serializers:invalidInvite', { name: entry.name });
		return true;
	}

	private async fetchInvite(code: string) {
		try {
			return (await this.container.rest.get(Routes.invite(code))) as RESTGetAPIInviteResult;
		} catch {
			return null;
		}
	}
}
