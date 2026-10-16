/**
 * What the placeholders of a greeting stand for.
 */
export interface GreetingContext {
	user: { readonly id: string; readonly username: string };
	guild: { readonly name: string; readonly memberCount: number | null };
	role?: { readonly id: string; readonly name: string } | null;
}

/**
 * The most characters of a message.
 */
const MaximumMessageLength = 2000;

/**
 * Writes a greeting: `%user%` mentions the member, `%username%` is their name, `%server%` the name of the server,
 * `%memberCount%` how many members it has and `%role%` the role of a role message, each also written in braces
 * (`{user}`), as other bots take them. A `\n` starts a new line, since the settings menu takes one message per line.
 *
 * @param template - The message as the server wrote it.
 * @param context - What the placeholders stand for.
 */
export function formatGreeting(template: string, context: GreetingContext): string {
	const values: Record<string, string> = {
		user: `<@${context.user.id}>`,
		username: context.user.username,
		server: context.guild.name,
		membercount: context.guild.memberCount === null ? '?' : String(context.guild.memberCount),
		role: context.role ? context.role.name : ''
	};

	const text = template
		.replace(/\\n/g, '\n')
		.replace(
			/\{(\w+)\}|%(\w+)%/g,
			(match, braced: string | undefined, percent: string | undefined) => values[(braced ?? percent)!.toLowerCase()] ?? match
		)
		.trim();
	return text.length > MaximumMessageLength ? `${text.slice(0, MaximumMessageLength - 1)}…` : text;
}

/**
 * Picks the greeting to send, one of the messages at random, so a server can have a few of them.
 *
 * @param messages - The messages of the server.
 * @param random - Where the randomness comes from, for the tests.
 * @returns The message, `null` when the server has none.
 */
export function pickGreeting(messages: readonly string[], random: () => number = Math.random): string | null {
	const usable = messages.filter((message) => message.trim() !== '');
	if (usable.length === 0) return null;
	return usable[Math.min(usable.length - 1, Math.floor(random() * usable.length))];
}
