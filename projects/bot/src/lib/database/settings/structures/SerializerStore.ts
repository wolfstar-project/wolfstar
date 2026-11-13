import { Serializer } from '#lib/database/settings/structures/Serializer';
import { AliasStore } from '@wolfstar/http-framework';

/**
 * The store of the {@link Serializer} pieces, in `src/serializers`.
 */
export class SerializerStore extends AliasStore<Serializer<unknown>, 'serializers'> {
	public constructor() {
		super(Serializer, { name: 'serializers' });
	}
}

declare module '@sapphire/pieces' {
	interface StoreRegistryEntries {
		serializers: SerializerStore;
	}
}
