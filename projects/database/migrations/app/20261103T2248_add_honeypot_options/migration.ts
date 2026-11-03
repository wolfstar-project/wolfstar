#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2bd6519063c2dd6fd637ddb28ff975f72b2dec8b3d9d05977dadd774ee5789e0/contract';
import endContract from '../../snapshots/2bd6519063c2dd6fd637ddb28ff975f72b2dec8b3d9d05977dadd774ee5789e0/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a715815ea8d00bfb20abd3f907b1c6b234e19510d491970bc9976a5c7a622ad9/contract';
import startContract from '../../snapshots/a715815ea8d00bfb20abd3f907b1c6b234e19510d491970bc9976a5c7a622ad9/contract.json' with { type: 'json' };
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
			this.addColumn({
				schema: 'public',
				table: 'GuildHoneypot',
				column: col('timeout_first', 'bool', {
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
