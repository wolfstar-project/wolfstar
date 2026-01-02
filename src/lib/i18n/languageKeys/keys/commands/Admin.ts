import type { LanguageHelpDisplayOptions } from '#lib/i18n/LanguageHelp';
import { FT, T } from '#lib/types';

export const RoleSetAdded = FT<{ name: string; roles: string[] }, string>('commands/admin:rolesetAdded');
export const RoleSetCreated = FT<{ name: string; roles: string[] }, string>('commands/admin:rolesetCreated');
export const RoleSetDescription = T<string>('commands/admin:rolesetDescription');
export const RoleSetExtended = T<LanguageHelpDisplayOptions>('commands/admin:rolesetExtended');
export const RoleSetNoRoleSets = T<string>('commands/admin:rolesetNoRolesets');
export const RoleSetRemoved = FT<{ name: string; roles: string[] }, string>('commands/admin:rolesetRemoved');
export const RoleSetResetAll = T<string>('commands/admin:rolesetResetAll');
export const RoleSetResetEmpty = T<string>('commands/admin:rolesetResetEmpty');
export const RoleSetResetGroup = FT<{ name: string }, string>('commands/admin:rolesetResetGroup');
export const RoleSetResetNotExists = FT<{ name: string }, string>('commands/admin:rolesetResetNotExists');
export const RoleSetUpdated = FT<{ name: string }, string>('commands/admin:rolesetUpdated');
