#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/823cb1ccd629214ad474ab7e4b79f4ba79540558587da45754ec124a7078e7c5/contract';
import endContract from '../../snapshots/823cb1ccd629214ad474ab7e4b79f4ba79540558587da45754ec124a7078e7c5/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ab554f53d4572afa6c140bc0eaeb9c16c929ffd55b27544bd803c01171365413/contract';
import startContract from '../../snapshots/ab554f53d4572afa6c140bc0eaeb9c16c929ffd55b27544bd803c01171365413/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				schema: 'public',
				table: 'StickyNickname',
				columns: [
					col('guild_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
					col('nickname', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
					col('user_id', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } })
				],
				constraints: [primaryKey(['guild_id', 'user_id'], { name: 'StickyNickname_pkey' })]
			}),
			this.addForeignKey({
				schema: 'public',
				table: 'StickyNickname',
				foreignKey: {
					name: 'StickyNickname_guild_id_fkey',
					columns: ['guild_id'],
					references: { schema: 'public', table: 'Guild', columns: ['id'] },
					onDelete: 'cascade',
					onUpdate: 'cascade'
				}
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
