#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/53a3381812ed50e913a7886c5f525c6056630166ab24393710536949f883afbf/contract';
import endContract from '../../snapshots/53a3381812ed50e913a7886c5f525c6056630166ab24393710536949f883afbf/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f8343a42cf2c3ba06d076c5d269fd03a3674297ec49238b835602e26a32ad8d7/contract';
import startContract from '../../snapshots/f8343a42cf2c3ba06d076c5d269fd03a3674297ec49238b835602e26a32ad8d7/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationHardAction',
				value: 'None'
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
