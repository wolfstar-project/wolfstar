import { Collection } from '@discordjs/collection';

class AliasedCollection<K, V> extends Collection<K, V> {
	/**
	 * The aliases for this collection:
	 */
	public readonly aliases = new Collection<K, V>();

	public override get(key: K): V | undefined {
		return super.get(key) ?? this.aliases.get(key);
	}
}

// Exported apart from its declaration: the auto import scanner reads the `, V` of the type parameters as a second export.
export { AliasedCollection };
