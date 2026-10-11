import { renderHoneypotLog, type HoneypotCatch } from '#lib/moderation/honeypot/log';
import { Colors } from '#utils/constants';
import { REST } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import { ComponentType, MessageFlags } from 'discord-api-types/v10';

const userId = '266624760782258186';
const channelId = '254360814063058945';

// Echoes the key and its options, the translations are not what is tested here:
const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)) as never;

function createCatch(overrides: Partial<HoneypotCatch> = {}): HoneypotCatch {
	return {
		action: 'Softban',
		user: { id: userId, username: 'spammer', discriminator: '0', avatar: null, global_name: null },
		channelId,
		content: 'free nitro https://example.com',
		attachments: 0,
		caseId: 12,
		...overrides
	};
}

function collectText(components: readonly unknown[]): string[] {
	const texts: string[] = [];
	for (const component of components as readonly { type: ComponentType; content?: string; components?: unknown[] }[]) {
		if (component.type === ComponentType.TextDisplay && component.content !== undefined) texts.push(component.content);
		texts.push(...collectText(component.components ?? []));
	}
	return texts;
}

function readText(message: ReturnType<typeof renderHoneypotLog>) {
	return collectText(message.components).join('\n');
}

describe('renderHoneypotLog', () => {
	// The avatar of who was caught is a CDN URL:
	beforeAll(() => {
		container.rest = new REST();
	});

	test('GIVEN a catch THEN it says who was caught, where, what was done and the case', () => {
		const message = renderHoneypotLog(t, createCatch());
		const text = readText(message);

		expect(message.flags).toBe(MessageFlags.IsComponentsV2);
		expect(text).toContain('events/moderation:honeypotLogCaught');
		expect(text).toContain(`"user":"<@${userId}> (${userId})"`);
		expect(text).toContain(`"channel":"<#${channelId}>"`);
		expect(text).toContain('"action":"serializers:honeypotActionSoftban"');
		expect(text).toContain('"caseId":12');
		expect(text).toContain('events/moderation:honeypotLogFooter');
	});

	test('GIVEN a catch THEN it is red and nobody is mentioned', () => {
		const message = renderHoneypotLog(t, createCatch());

		expect(message.components[0]).toMatchObject({ type: ComponentType.Container, accent_color: Colors.Red });
		expect(message.allowed_mentions).toEqual({ parse: [] });
	});

	test('GIVEN what was sent THEN it is quoted in a code block, so its links cannot be followed', () => {
		const text = readText(renderHoneypotLog(t, createCatch({ content: 'look ```here``` https://example.com' })));

		expect(text).toContain("```\nlook '''here''' https://example.com\n```");
	});

	test('GIVEN a long message THEN only its start is quoted', () => {
		const text = readText(renderHoneypotLog(t, createCatch({ content: 'a'.repeat(5000) })));

		expect(text.length).toBeLessThan(2000);
	});

	test('GIVEN a message with attachments only THEN they are counted and nothing is quoted', () => {
		const text = readText(renderHoneypotLog(t, createCatch({ content: '', attachments: 3 })));

		expect(text).toContain('events/moderation:honeypotLogAttachments {"count":3}');
		expect(text).not.toContain('```');
	});

	test('GIVEN an action Discord refused THEN it is amber and says why', () => {
		const message = renderHoneypotLog(t, createCatch({ caseId: null, error: 'Missing Permissions' }));
		const text = readText(message);

		expect(message.components[0]).toMatchObject({ accent_color: Colors.Amber });
		expect(text).toContain('events/moderation:honeypotLogFailed');
		expect(text).toContain('"error":"Missing Permissions"');
		expect(text).not.toContain('honeypotLogCaught');
	});

	test('GIVEN an action that failed for another reason THEN it points at the logs of the bot', () => {
		const text = readText(renderHoneypotLog(t, createCatch({ caseId: null })));

		expect(text).toContain('"error":"events/moderation:honeypotLogUnknownError"');
	});
});
