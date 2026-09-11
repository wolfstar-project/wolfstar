export enum SettingsMenuAction {
	Select,
	Back,
	Stop,
	Set,
	Remove,
	Reset,
	Undo,
	Cancel,
	InputBoolTrue,
	InputBoolFalse,
	InputRole,
	InputChannel,
	InputRemove,
	InputCategory,
	InputCommand,
	InputCommandBack,
	InputModal,
	InputModalField
}

export enum SettingsMenuUpdateType {
	Set,
	Remove,
	Reset,
	Replace
}

export interface SettingsMenuCustomIdData {
	u: string;
	a: SettingsMenuAction;
	p: string;
	im?: 0 | 1;
	it?: SettingsMenuUpdateType;
	sc?: string;
}

export const SettingsMenuPrefixes: Record<SettingsMenuAction, string> = {
	[SettingsMenuAction.Select]: 'conf-select',
	[SettingsMenuAction.Back]: 'conf-back',
	[SettingsMenuAction.Stop]: 'conf-stop',
	[SettingsMenuAction.Set]: 'conf-set',
	[SettingsMenuAction.Remove]: 'conf-remove',
	[SettingsMenuAction.Reset]: 'conf-reset',
	[SettingsMenuAction.Undo]: 'conf-undo',
	[SettingsMenuAction.Cancel]: 'conf-cancel',
	[SettingsMenuAction.InputBoolTrue]: 'conf-input-bool-true',
	[SettingsMenuAction.InputBoolFalse]: 'conf-input-bool-false',
	[SettingsMenuAction.InputRole]: 'conf-input-role',
	[SettingsMenuAction.InputChannel]: 'conf-input-channel',
	[SettingsMenuAction.InputRemove]: 'conf-input-remove',
	[SettingsMenuAction.InputCategory]: 'conf-input-category',
	[SettingsMenuAction.InputCommand]: 'conf-input-command',
	[SettingsMenuAction.InputCommandBack]: 'conf-input-command-back',
	[SettingsMenuAction.InputModal]: 'conf-input-modal',
	[SettingsMenuAction.InputModalField]: 'conf-input-modal-field'
};

export const prefixToSettingsMenuAction = new Map<string, SettingsMenuAction>(
	Object.entries(SettingsMenuPrefixes).map(([action, prefix]) => [prefix, Number(action) as SettingsMenuAction])
);
