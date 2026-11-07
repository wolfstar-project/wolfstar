#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/17d322e0a6f7750f664ce602c9a86b3d0910800b4eba4175829971b68535c110/contract';
import startContract from '../../snapshots/17d322e0a6f7750f664ce602c9a86b3d0910800b4eba4175829971b68535c110/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d97d81cd6b968528b2c1ef453ea205af470f51100524516b6b0e053162964b56/contract';
import endContract from '../../snapshots/d97d81cd6b968528b2c1ef453ea205af470f51100524516b6b0e053162964b56/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'Phishing'
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
