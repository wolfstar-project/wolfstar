import { Serializer } from '#lib/database';
import type { Awaitable } from '@sapphire/utilities';

export class UserSerializer extends Serializer<string> {
	public parse(input: string, { t }: Serializer.UpdateContext) {
		const value = input.trim();
		const languages = [...this.container.i18n.languages.keys()];
		const language = languages.find((code) => code.toLowerCase() === value.toLowerCase());
		return language === undefined ? this.error(t('arguments:language', { parameter: value, possibles: languages })) : this.ok(language);
	}

	public isValid(value: string): Awaitable<boolean> {
		return this.container.i18n.languages.has(value);
	}
}
