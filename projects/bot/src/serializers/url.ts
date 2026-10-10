import { Serializer } from '#lib/database';
import type { Awaitable } from '@sapphire/utilities';

export class UserSerializer extends Serializer<string> {
	private readonly kProtocol = /^https?:\/\//;

	public parse(input: string, { t, entry }: Serializer.UpdateContext) {
		const hostname = this.getHostname(input.trim());
		if (hostname === null) return this.error(t('serializers:invalidUrl', { name: entry.name }));
		if (hostname.length > 128) return this.error(t('serializers:minMaxMaxInclusive', { name: entry.name, max: 128 }));
		return this.ok(hostname);
	}

	public isValid(value: string, { t, entry }: Serializer.UpdateContext): Awaitable<boolean> {
		const hostname = this.getHostname(value);
		if (hostname === null) throw new Error(t('serializers:invalidUrl', { name: entry.name }));
		return hostname.length <= 128;
	}

	public override stringify(data: string) {
		return `https://${data}`;
	}

	private getHostname(value: string) {
		try {
			return new URL(this.kProtocol.test(value) ? value : `https://${value}`).hostname;
		} catch {
			return null;
		}
	}
}
