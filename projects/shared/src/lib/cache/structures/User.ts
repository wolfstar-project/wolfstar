import type { IStructure } from './interfaces/IStructure.js';
import type { APIUser } from 'discord-api-types/v10';
import { Writer } from '../../data/Writer.js';
import type { Nullish } from '@sapphire/utilities';

export class User implements IStructure {
	public readonly id: bigint;
	public readonly username: string;
	public readonly globalName: string | null;
	public readonly discriminator: number;
	public readonly avatar: string | null;
	public readonly bot: boolean | null;
	public readonly flags: number | null;

	public constructor(data: User.Data) {
		this.id = data.id;
		this.username = data.username;
		this.discriminator = data.discriminator;
		this.avatar = data.avatar ?? null;
		this.bot = data.bot ?? null;
		this.flags = data.flags ?? null;
	}
	toBuffer(): Buffer {
		return new Writer(100)
			.u64(this.id)
			.string(this.username)
			.string(this.globalName)
			.u16(this.discriminator)
			.string(this.avatar)
			.bool(this.bot)
			.u32(this.flags).trimmed;
	}
	toJSON(): User.Json {
		return {
			...this.toJSON(),
			id: this.id.toString(),
			username: this.username,
			discriminator: this.discriminator.toString().padStart(4, '0'),
			avatar: this.avatar,
			bot: this.bot,
			flags: this.flags,
		};
	}
}




export namespace User {
   export type Json = APIUser;

	export interface Data {
		id: bigint;
		username: string;
		globalName?: string | Nullish;
		discriminator: number;
		bot?: boolean | Nullish;
		avatar?: string | Nullish;
		flags?: number | Nullish;
		joinedAt?: number | Nullish;
	}
}
