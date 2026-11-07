#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/55e7fe64165356d06c0903bec91d4e8a1d8c8181079de85262c29221c276a9a4/contract';
import startContract from '../../snapshots/55e7fe64165356d06c0903bec91d4e8a1d8c8181079de85262c29221c276a9a4/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/8356b07843fa65358d89980593a4c4e2c076a739225933f31901024c188dc783/contract';
import endContract from '../../snapshots/8356b07843fa65358d89980593a4c4e2c076a739225933f31901024c188dc783/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'Polls'
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
