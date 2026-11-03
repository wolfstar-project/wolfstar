#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/a7587b274e1d140b8641d826978781930b4a8587218f5e2d147f23ddb7fa20c6/contract';
import startContract from '../../snapshots/a7587b274e1d140b8641d826978781930b4a8587218f5e2d147f23ddb7fa20c6/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/ef9af6adae72bd915042fd65813c344e8e5f035e5f8fcb3147ccd895b6e37e16/contract';
import endContract from '../../snapshots/ef9af6adae72bd915042fd65813c344e8e5f035e5f8fcb3147ccd895b6e37e16/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				schema: 'public',
				table: 'GuildHoneypot',
				column: col('chaos_name', 'bool', {
					notNull: true,
					default: lit(false),
					codecRef: { codecId: 'pg/bool@1' }
				})
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildHoneypot',
				column: col('ensure_deletion', 'bool', {
					notNull: true,
					default: lit(false),
					codecRef: { codecId: 'pg/bool@1' }
				})
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildHoneypot',
				column: col('forward_message', 'bool', {
					notNull: true,
					default: lit(false),
					codecRef: { codecId: 'pg/bool@1' }
				})
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildHoneypot',
				column: col('recent_delete', 'bool', {
					notNull: true,
					default: lit(false),
					codecRef: { codecId: 'pg/bool@1' }
				})
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildHoneypot',
				column: col('timeout_first', 'bool', {
					notNull: true,
					default: lit(false),
					codecRef: { codecId: 'pg/bool@1' }
				})
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
