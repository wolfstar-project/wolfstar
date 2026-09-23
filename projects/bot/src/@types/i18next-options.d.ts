// oxlint-disable-next-line import/no-unassigned-import -- module augmentation
import 'i18next';

declare module 'i18next' {
	interface CustomTypeOptions {
		defaultNS: 'globals';
	}
}
