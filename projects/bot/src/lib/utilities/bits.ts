import { GuildSystemChannelFlags, PermissionFlagsBits } from 'discord-api-types/v10';

type BitFlagValue = number | bigint;

/**
 * A minimal, dependency-free counterpart of `BitField` from `@sapphire/bitfield`, exposing the subset the
 * moderation code relies on: `flags`, `has`, `any`, `toArray` and `resolve`.
 */
export class BitField<Flags extends Record<string, BitFlagValue>> {
	public readonly flags: Flags;
	readonly #zero: BitFlagValue;
	readonly #entries: readonly (readonly [keyof Flags & string, BitFlagValue])[];

	public constructor(flags: Flags) {
		this.flags = flags;
		this.#entries = Object.entries(flags) as [keyof Flags & string, BitFlagValue][];
		this.#zero = this.#entries.some(([, value]) => typeof value === 'bigint') ? 0n : 0;
	}

	/**
	 * Checks whether `field` has every bit of `bits`.
	 */
	public has<T extends BitFlagValue>(field: T, bits: T): boolean {
		return ((field as any) & (bits as any)) === bits;
	}

	/**
	 * Checks whether `field` has at least one bit of `bits`.
	 */
	public any<T extends BitFlagValue>(field: T, bits: T): boolean {
		return ((field as any) & (bits as any)) !== this.#zero;
	}

	/**
	 * Resolves a flag name, a number, or an array of them, into the combined bits.
	 */
	public resolve(resolvable: keyof Flags | BitFlagValue | readonly (keyof Flags | BitFlagValue)[]): BitFlagValue {
		if (Array.isArray(resolvable)) {
			return resolvable.reduce<BitFlagValue>((acc, value) => (acc as any) | (this.resolve(value) as any), this.#zero);
		}

		if (typeof resolvable === 'number' || typeof resolvable === 'bigint') return resolvable;
		return this.flags[resolvable as keyof Flags];
	}

	/**
	 * Gets the names of the flags set in `field`.
	 */
	public toArray(field: BitFlagValue): (keyof Flags & string)[] {
		const output: (keyof Flags & string)[] = [];
		for (const [name, value] of this.#entries) {
			if (((field as any) & (value as any)) === value && value !== this.#zero) output.push(name);
		}

		return output;
	}
}

/**
 * Gets the entries of an object, typed.
 */
function objectEntries<T extends Record<string, unknown>>(value: T) {
	return Object.entries(value) as { [K in keyof T & string]: [K, T[K]] }[keyof T & string][];
}

const { ManageEmojisAndStickers: _ManageEmojisAndStickers, ...PermissionFlagsWithoutDeprecated } = PermissionFlagsBits;

export const PermissionsBits = new BitField(PermissionFlagsWithoutDeprecated);
export const PermissionsBitsList = objectEntries(PermissionsBits.flags);
export function toPermissionsArray(bits: bigint) {
	return PermissionsBits.toArray(bits);
}

const SystemChannelFlagsObject = Object.fromEntries(Object.entries(GuildSystemChannelFlags).filter(([, value]) => typeof value === 'number')) as {
	[K in Exclude<keyof typeof GuildSystemChannelFlags, `${number}`>]: (typeof GuildSystemChannelFlags)[K];
};

export const SystemChannelFlag = new BitField(SystemChannelFlagsObject);
export const SystemChannelFlagList = objectEntries(SystemChannelFlag.flags);
export function toChannelsArray(bits: number) {
	return SystemChannelFlag.toArray(bits);
}
