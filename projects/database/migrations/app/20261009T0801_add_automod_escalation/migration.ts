#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/cb003055e429e62af44e664ada0e9b2ef69c00a87b2c2d9209f445f93eaa6f18/contract';
import endContract from '../../snapshots/cb003055e429e62af44e664ada0e9b2ef69c00a87b2c2d9209f445f93eaa6f18/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f8a84fe061e98498fab2b4f28ea2d01a1c14a59976823d9e40d088803755eccd/contract';
import startContract from '../../snapshots/f8a84fe061e98498fab2b4f28ea2d01a1c14a59976823d9e40d088803755eccd/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				schema: 'public',
				table: 'GuildAutoModerationRule',
				column: col('escalation', '"jsonb"', {
					notNull: true,
					default: fn("'[]'::jsonb"),
					codecRef: {
						codecId: 'typed/json@1',
						typeParams: { tsType: 'PrismaJson.AutoModerationRuleEscalation' }
					}
				})
			}),
			this.addColumn({
				schema: 'public',
				table: 'GuildAutoModerationRule',
				column: col('escalation_duration', 'int4', {
					notNull: true,
					default: lit(86400000),
					codecRef: { codecId: 'pg/int4@1' }
				})
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
