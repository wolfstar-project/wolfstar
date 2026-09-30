const flags = {
	Delete: 1 << 0,
	Log: 1 << 1,
	Alert: 1 << 2
} as const;

type Flag = keyof typeof flags;
type Resolvable = Flag | number | readonly Resolvable[];

/**
 * The soft actions an auto-moderation rule takes when it is infracted, stored as a bitfield.
 *
 * This is the subset of `@sapphire/bitfield`'s `BitField` the bot used, which is not a dependency of this project.
 */
export const AutoModerationOnInfraction = {
	flags,

	/**
	 * Every flag combined.
	 */
	all: flags.Delete | flags.Log | flags.Alert,

	/**
	 * Checks whether a bitfield has all the bits of another one.
	 *
	 * @param bitfield - The bitfield to check.
	 * @param bit - The bits that must be set.
	 */
	has(bitfield: number, bit: number): boolean {
		return (bitfield & bit) === bit;
	},

	/**
	 * Resolves the bits of a flag name, a bitfield or a list of them.
	 *
	 * @param resolvable - The value to resolve.
	 */
	resolve(resolvable: Resolvable): number {
		if (typeof resolvable === 'number') return resolvable;
		if (typeof resolvable === 'string') return flags[resolvable];

		let bitfield = 0;
		for (const value of resolvable) bitfield |= AutoModerationOnInfraction.resolve(value);
		return bitfield;
	},

	/**
	 * Removes the bits of one bitfield from another one.
	 *
	 * @param bitfield - The bitfield to remove the bits from.
	 * @param bit - The bits to remove.
	 */
	difference(bitfield: number, bit: number): number {
		return bitfield & ~bit;
	}
};

export namespace AutoModerationOnInfraction {
	export type Flag = keyof typeof flags;
	export type Resolvable = Flag | number | readonly Resolvable[];
}

export enum AutoModerationPunishment {
	None,
	Warning,
	Kick,
	Mute,
	Softban,
	Ban,
	Timeout
}
