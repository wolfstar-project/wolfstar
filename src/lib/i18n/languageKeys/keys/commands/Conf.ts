import type { LanguageHelpDisplayOptions } from '#lib/i18n/LanguageHelp';
import { FT, T } from '#lib/types';

// Root
export const Name = T('commands/conf:name');
export const Description = T('commands/conf:description');

export const Menu = T('commands/conf:menuName');
export const MenuDescription = T('commands/conf:menuDescription');
export const Show = T('commands/conf:showName');
export const ShowDescription = T('commands/conf:showDescription');
export const Set = T('commands/conf:setName');
export const SetDescription = T('commands/conf:setDescription');
export const Remove = T('commands/conf:removeName');
export const RemoveDescription = T('commands/conf:removeDescription');
export const Reset = T('commands/conf:resetName');
export const ResetDescription = T('commands/conf:resetDescription');

export const OptionKey = T('commands/conf:optionsKeyName');
export const OptionKeyDescription = T('commands/conf:optionsKeyDescription');
export const OptionValue = T('commands/conf:optionsValueName');
export const OptionValueDescription = T('commands/conf:optionsValueDescription');

export const Get = FT<{ key: string; value: string }>('commands/conf:get');
export const GetNoExt = FT<{ key: string }>('commands/conf:getNoExt');
export const MenuInvalidAction = T('commands/conf:menuInvalidAction');
export const MenuInvalidKey = T('commands/conf:menuInvalidKey');
export const MenuRenderAtFolder = FT<{ path: string }>('commands/conf:menuRenderAtFolder');
export const MenuRenderAtPiece = FT<{ path: string }>('commands/conf:menuRenderAtPiece');
export const MenuRenderBack = T('commands/conf:menuRenderBack');
export const MenuRenderCvalue = FT<{ value: string }>('commands/conf:menuRenderCvalue');
export const MenuRenderNokeys = T('commands/conf:menuRenderNokeys');
export const MenuRenderRemove = T('commands/conf:menuRenderRemove');
export const MenuRenderReset = T('commands/conf:menuRenderReset');
export const MenuRenderSelect = T('commands/conf:menuRenderSelect');
export const MenuRenderUndo = T('commands/conf:menuRenderUndo');
export const MenuRenderUpdate = T('commands/conf:menuRenderUpdate');
export const MenuSaved = T('commands/conf:menuSaved');
export const Nochange = FT<{ key: string }>('commands/conf:nochange');
export const ResetSuccess = FT<{ key: string; value: string }>('commands/conf:resetSuccess');
export const Server = FT<{ key: string; list: string }>('commands/conf:server');
export const ServerDescription = T('commands/conf:serverDescription');
export const ServerExtended = T<LanguageHelpDisplayOptions>('commands/conf:serverExtended');
export const SettingNotSet = T('commands/conf:settingNotSet');
export const Updated = FT<{ key: string; response: string }>('commands/conf:updated');
export const DashboardOnlyKey = FT<{ key: string }>('commands/conf:dashboardOnlyKey');
