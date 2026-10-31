#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/c4b20819e55a21e308303917e2c96a3e8d97f285edcb1516269fce0a5d01fd63/contract';
import startContract from '../../snapshots/c4b20819e55a21e308303917e2c96a3e8d97f285edcb1516269fce0a5d01fd63/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f8a84fe061e98498fab2b4f28ea2d01a1c14a59976823d9e40d088803755eccd/contract';
import endContract from '../../snapshots/f8a84fe061e98498fab2b4f28ea2d01a1c14a59976823d9e40d088803755eccd/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'Duplicates'
			}),
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'Characters'
			}),
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'Emojis'
			}),
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'MessageSpam'
			}),
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'ImageSpam'
			}),
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'LinksCooldown'
			}),
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'MassMentions'
			}),
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'MentionsCooldown'
			}),
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'Spoilers'
			}),
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'MaskedLinks'
			}),
			this.addNativeEnumValue({
				schema: 'public',
				typeName: 'GuildAutoModerationRuleType',
				value: 'StickersCooldown'
			})
		];
	}
}

MigrationCLI.run(import.meta.url, M);
