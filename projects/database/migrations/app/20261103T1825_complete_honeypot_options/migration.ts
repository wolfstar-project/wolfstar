#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/5387137555d932b67462162becb8babd3378a00a6d90a3bbe8d0b1aea9f33ead/contract';
import endContract from '../../snapshots/5387137555d932b67462162becb8babd3378a00a6d90a3bbe8d0b1aea9f33ead/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ef9af6adae72bd915042fd65813c344e8e5f035e5f8fcb3147ccd895b6e37e16/contract';
import startContract from '../../snapshots/ef9af6adae72bd915042fd65813c344e8e5f035e5f8fcb3147ccd895b6e37e16/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				schema: 'public',
				table: 'GuildHoneypot',
				column: col('channels', 'int8[]', {
					notNull: true,
					default: lit([]),
					codecRef: { codecId: 'pg/int8@1', many: true }
				})
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildHoneypot',
				column: col('recreate', 'bool', {
					notNull: true,
					default: lit(false),
					codecRef: { codecId: 'pg/bool@1' }
				})
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildHoneypot',
				column: col('reinvite', 'bool', {
					notNull: true,
					default: lit(false),
					codecRef: { codecId: 'pg/bool@1' }
				})
			}),
			this.addCheckConstraint({
				schema: 'public',
				table: 'GuildHoneypot',
				constraint: 'GuildHoneypot_channels_elem_not_null_6ac6295a',
				expression: 'array_position("channels", NULL) IS NULL'
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
