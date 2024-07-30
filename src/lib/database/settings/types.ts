import type { GuildEntity } from '#lib/database/entities';
import type { DeepReadonly } from '@sapphire/utilities';
import type { BaseEntity } from 'typeorm';

export type GuildData = Omit<GuildEntity, keyof BaseEntity>;

export type GuildDataKey = keyof GuildData;
export type GuildDataValue = GuildData[GuildDataKey];

type ReadonlyGuildEntityExcludeKeys = keyof BaseEntity;

export type ReadonlyGuildEntity = DeepReadonly<Omit<GuildEntity, ReadonlyGuildEntityExcludeKeys>> & Pick<GuildEntity, ReadonlyGuildEntityExcludeKeys>;
export type ReadonlyGuildData = DeepReadonly<GuildData>;
export type ReadonlyGuildDataValue = DeepReadonly<GuildDataValue>;
