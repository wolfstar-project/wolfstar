import { Serializer, readSettingsWordFilterRegExp, type ReadonlyGuildData } from '#lib/database';
import type { Awaitable } from '@sapphire/utilities';
import { remove as removeConfusables } from 'confusables';

export class UserSerializer extends Serializer<string> {
	public parse(input: string, context: Serializer.UpdateContext) {
		const { t, entry, entity } = context;
		const word = removeConfusables(input.trim().toLowerCase());

		const result = this.minOrMax(word, word.length, context);
		if (result.isErr()) return result;

		if (this.hasWord(entity, word)) return this.error(t('serializers:wordIncluded', { name: entry.name, word }));
		return this.ok(word);
	}

	public isValid(value: string, context: Serializer.UpdateContext): Awaitable<boolean> {
		const word = removeConfusables(value.toLowerCase());
		return value === word && this.minOrMax(value, value.length, context).isOk();
	}

	/**
	 * Whether the word filter already catches the word, either because it is in the list or because another word of the
	 * list matches it.
	 */
	private hasWord(settings: ReadonlyGuildData, content: string) {
		if (settings.selfmodWordsList.includes(content)) return true;

		const regExp = readSettingsWordFilterRegExp(settings);
		if (regExp === null) return false;

		regExp.lastIndex = 0;
		return regExp.test(content);
	}
}
