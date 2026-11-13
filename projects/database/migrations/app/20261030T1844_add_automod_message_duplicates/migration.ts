#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/53a3381812ed50e913a7886c5f525c6056630166ab24393710536949f883afbf/contract';
import startContract from '../../snapshots/53a3381812ed50e913a7886c5f525c6056630166ab24393710536949f883afbf/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b461f6bcef5ad06a5652db38883f008f1d6e4dc4835aa1bae28f394d71da9a2e/contract';
import endContract from '../../snapshots/b461f6bcef5ad06a5652db38883f008f1d6e4dc4835aa1bae28f394d71da9a2e/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'MessageDuplicates'
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
