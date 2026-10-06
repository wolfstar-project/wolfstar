import { DurationFormatter, TimeTypes, type DurationFormatAssetsTime } from '@sapphire/time-utilities';

/**
 * What a language needs beyond its translation files: the words its durations are written with.
 */
export class Handler {
	public readonly name: string;
	public readonly duration: DurationFormatter;

	public constructor(options: Handler.Options) {
		this.name = options.name;
		this.duration = new DurationFormatter(options.duration);
	}
}

export declare namespace Handler {
	interface Options {
		name: string;
		duration: DurationFormatAssetsTime;
	}
}

type Units = readonly [year: Unit, month: Unit, week: Unit, day: Unit, hour: Unit, minute: Unit, second: Unit];
type Unit = readonly [singular: string, plural: string];

function makeHandler(name: string, [year, month, week, day, hour, minute, second]: Units) {
	const unit = ([singular, plural]: Unit) => ({ 1: singular, DEFAULT: plural });
	return new Handler({
		name,
		duration: {
			[TimeTypes.Year]: unit(year),
			[TimeTypes.Month]: unit(month),
			[TimeTypes.Week]: unit(week),
			[TimeTypes.Day]: unit(day),
			[TimeTypes.Hour]: unit(hour),
			[TimeTypes.Minute]: unit(minute),
			[TimeTypes.Second]: unit(second)
		}
	});
}

/**
 * The handlers of the languages that have one, the same five as the original bot.
 */
export const handlers = new Map<string, Handler>([
	[
		'de',
		makeHandler('de', [
			['Jahr', 'Jahre'],
			['Monat', 'Monate'],
			['Woche', 'Wochen'],
			['Tag', 'Tage'],
			['Stunde', 'Stunden'],
			['Minute', 'Minuten'],
			['Sekunde', 'Sekunden']
		])
	],
	[
		'en-US',
		makeHandler('en-US', [
			['year', 'years'],
			['month', 'months'],
			['week', 'weeks'],
			['day', 'days'],
			['hour', 'hours'],
			['minute', 'minutes'],
			['second', 'seconds']
		])
	],
	[
		'en-GB',
		makeHandler('en-GB', [
			['year', 'years'],
			['month', 'months'],
			['week', 'weeks'],
			['day', 'days'],
			['hour', 'hours'],
			['minute', 'minutes'],
			['second', 'seconds']
		])
	],
	[
		'es-ES',
		makeHandler('es-ES', [
			['año', 'años'],
			['mes', 'meses'],
			['semana', 'semanas'],
			['día', 'días'],
			['hora', 'horas'],
			['minuto', 'minutos'],
			['segundo', 'segundos']
		])
	],
	[
		'nl',
		makeHandler('nl', [
			['jaar', 'jaren'],
			['maand', 'maanden'],
			['week', 'weken'],
			['dag', 'dagen'],
			['uur', 'uren'],
			['minuut', 'minuten'],
			['seconde', 'seconden']
		])
	]
]);

/**
 * Gets the handler of a language, the English one for the languages that have none.
 */
export function getHandler(name: string): Handler {
	return handlers.get(name) ?? handlers.get('en-US')!;
}
