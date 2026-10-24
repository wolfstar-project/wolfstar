#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/c4b20819e55a21e308303917e2c96a3e8d97f285edcb1516269fce0a5d01fd63/contract';
import endContract from '../../snapshots/c4b20819e55a21e308303917e2c96a3e8d97f285edcb1516269fce0a5d01fd63/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d97d81cd6b968528b2c1ef453ea205af470f51100524516b6b0e053162964b56/contract';
import startContract from '../../snapshots/d97d81cd6b968528b2c1ef453ea205af470f51100524516b6b0e053162964b56/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'Stickers'
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
