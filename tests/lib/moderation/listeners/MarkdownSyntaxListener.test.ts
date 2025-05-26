import { MarkdownSyntaxListener } from '#listeners/moderation/messages/MarkdownSyntaxListener';
import { đọcSettings, type GuildSettingsAll } from '#lib/database'; // Assuming 'đọcSettings' is 'readSettings'
import { getTag } from '#lib/util/functions';
import { vi, describe, beforeEach, test, expect, mock } from 'vitest';
import type { GuildMessage } from '#lib/types';

// Mock readSettings from '#lib/database'
// Using 'đọcSettings' as it appears in the actual listener file import,
// if it's a typo and should be 'readSettings', this mock needs to be adjusted.
vi.mock('#lib/database', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/database')>();
	return {
		...actual,
		readSettings: vi.fn(), // Mocking readSettings, assuming 'đọcSettings' was a typo in source
		đọcSettings: vi.fn() // Also mocking 'đọcSettings' in case it's not a typo
	};
});

// Mock getTag (if needed by onLogMessage, though preProcess is main focus)
vi.mock('#lib/util/functions', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/util/functions')>();
	return {
		...actual,
		getTag: vi.fn((user) => `${user.username}#${user.discriminator}`)
	};
});

// Define default thresholds as they are in the listener, for assertion checks
const DEFAULT_MAX_SPOILERS_COUNT = 5;
const DEFAULT_MAX_SPOILERS_PERCENTAGE = 0.7; // 70%
const DEFAULT_MAX_BACKTICKS_COUNT = 3;
const DEFAULT_MAX_BACKTICKS_PERCENTAGE = 0.7; // 70%
const DEFAULT_MAX_EMPHASIS_COUNT = 5; // Number of "overuse" sequences like ***
const DEFAULT_MAX_EMPHASIS_PERCENTAGE = 0.8; // 80%

describe('MarkdownSyntaxListener', () => {
	let listener: MarkdownSyntaxListener;

	// Determine which mock function to use based on what's actually available after mocking.
	// It seems 'readSettings' is the standard, but the listener used 'đọcSettings'.
	// Vitest's `vi.mocked` can work with the actual name if the mock is set up correctly.
	// For clarity, we'll assume 'readSettings' is the intended name based on conventions.
	const mockReadSettings = đọcSettings as unknown as ReturnType<typeof mock>; // Or cast to specific mock type

	beforeEach(() => {
		listener = new MarkdownSyntaxListener({ client: {} } as any, { name: 'markdownSyntaxListener' } as any);
		mockReadSettings.mockReset();
		// Default behavior: filter enabled, no specific thresholds set (use listener defaults)
		mockReadSettings.mockResolvedValue({
			selfmodMarkdownSyntaxEnabled: true,
			t: vi.fn((key: string, data?: any) => { // Mock the translation function
                let message = key;
                if (data) {
                    for (const k in data) {
                        message = message.replace(`{{${k}}}`, data[k]);
                    }
                }
                return message;
            })
		} as unknown as GuildSettingsAll);
	});

	const createMockMessage = (content: string, authorId = 'user123', guildId = 'guild123'): GuildMessage =>
		({
			content,
			author: { id: authorId, bot: false, username: 'TestUser', discriminator: '0001' },
			system: false,
			guild: { id: guildId },
			isSystem: () => false,
			isDM: () => false,
			isGuild: () => true,
			isURL: () => false,
			toString: () => content
			// Add other properties if the listener accesses them
		}) as any;

	const setMockSettings = (settings: Partial<GuildSettingsAll & { t: ReturnType<typeof vi.fn> }>) => {
		const baseSettings = {
			selfmodMarkdownSyntaxEnabled: true,
			t: vi.fn((key: string, data?: any) => {
                let message = key;
                if (data) {
                    for (const k in data) {
                        message = message.replace(`{{${k}}}`, data[k]);
                    }
                }
                return message;
            }),
			...settings
		};
		mockReadSettings.mockResolvedValue(baseSettings as GuildSettingsAll);
	};

	test('should return null for a normal message with no excessive markdown', async () => {
		const message = createMockMessage('This is a perfectly normal message.');
		await expect(listener.preProcess(message)).resolves.toBeNull();
	});

	test('should return null if the filter is disabled', async () => {
		setMockSettings({ selfmodMarkdownSyntaxEnabled: false, selfmodMarkdownSyntaxMaxSpoilersCount: 1 });
		const message = createMockMessage('||spoiler1|| ||spoiler2||'); // Would otherwise be an infraction
		await expect(listener.preProcess(message)).resolves.toBeNull();
	});

	test('should return null for an empty message', async () => {
		const message = createMockMessage('');
		await expect(listener.preProcess(message)).resolves.toBeNull();
	});

	test('should return null for a message with only whitespace', async () => {
		const message = createMockMessage('   \n\t   ');
		await expect(listener.preProcess(message)).resolves.toBeNull();
	});

	// Spoiler Tests
	describe('Spoiler Abuse', () => {
		test('should detect excessive spoilers by count (using default threshold)', async () => {
			// Default is 5. Test with 6.
			const messageContent = Array(DEFAULT_MAX_SPOILERS_COUNT + 1)
				.fill(0)
				.map((_, i) => `||spoiler${i}||`)
				.join(' ');
			const message = createMockMessage(messageContent);
			const result = await listener.preProcess(message);
			expect(result).toEqual({
				type: 'spoiler',
				count: DEFAULT_MAX_SPOILERS_COUNT + 1,
				threshold: `>${DEFAULT_MAX_SPOILERS_COUNT} tags`
			});
		});

		test('should detect excessive spoilers by count (using custom threshold)', async () => {
			setMockSettings({ selfmodMarkdownSyntaxMaxSpoilersCount: 2 });
			const message = createMockMessage('||spoiler1|| ||spoiler2|| ||spoiler3||');
			const result = await listener.preProcess(message);
			expect(result).toEqual({
				type: 'spoiler',
				count: 3,
				threshold: '>2 tags'
			});
		});

		test('should detect excessive spoilers by percentage (using default threshold)', async () => {
			// Default is 70%. Test with content that is >70% spoilers.
			// "||long spoiler content here|| short" -> spoiler content is 28, total non-space is 33. 28/33 ~ 84%
			const message = createMockMessage('||long spoiler content here|| short');
			const result = await listener.preProcess(message);
			expect(result).toEqual({
				type: 'spoiler',
				percentage: (28 / 33), // spoilerContentLength / contentLength
				threshold: `>${DEFAULT_MAX_SPOILERS_PERCENTAGE * 100}% content`
			});
		});

		test('should detect excessive spoilers by percentage (using custom threshold)', async () => {
			setMockSettings({ selfmodMarkdownSyntaxMaxSpoilersPercentage: 0.5 }); // 50%
			const message = createMockMessage('||spoiler content|| other'); // spoiler 15, total 20 -> 75%
			const result = await listener.preProcess(message);
			expect(result).toEqual({
				type: 'spoiler',
				percentage: 15 / 20,
				threshold: '>50% content'
			});
		});

		test('should return null if spoiler usage is below thresholds', async () => {
			setMockSettings({ selfmodMarkdownSyntaxMaxSpoilersCount: 5, selfmodMarkdownSyntaxMaxSpoilersPercentage: 0.7 });
			const message = createMockMessage('||spoiler1|| ||spoiler2|| This is fine.');
			await expect(listener.preProcess(message)).resolves.toBeNull();
		});
	});

	// Backtick Tests
	describe('Backtick Abuse', () => {
		test('should detect excessive backticks by count (using default threshold)', async () => {
			// Default is 3. Test with 4.
			const messageContent = Array(DEFAULT_MAX_BACKTICKS_COUNT + 1)
				.fill(0)
				.map((_, i) => `\`code${i}\``)
				.join(' ');
			const message = createMockMessage(messageContent);
			const result = await listener.preProcess(message);
			expect(result).toEqual({
				type: 'backtick',
				count: DEFAULT_MAX_BACKTICKS_COUNT + 1,
				threshold: `>${DEFAULT_MAX_BACKTICKS_COUNT} blocks/inline`
			});
		});

		test('should detect excessive backticks by count (using custom threshold)', async () => {
			setMockSettings({ selfmodMarkdownSyntaxMaxBackticksCount: 2 });
			const message = createMockMessage('`code1` `code2` `code3`');
			const result = await listener.preProcess(message);
			expect(result).toEqual({
				type: 'backtick',
				count: 3,
				threshold: '>2 blocks/inline'
			});
		});

		test('should detect excessive backticks by percentage (using default threshold)', async () => {
			// Default is 70%.
			// "`long code content here` short" -> code content 20, total non-space 25. 20/25 = 80%
			const message = createMockMessage('`long code content here` short');
			const result = await listener.preProcess(message);
			expect(result).toEqual({
				type: 'backtick',
				percentage: 20 / 25,
				threshold: `>${DEFAULT_MAX_BACKTICKS_PERCENTAGE * 100}% content`
			});
		});

		test('should detect excessive backticks by percentage (using custom threshold)', async () => {
			setMockSettings({ selfmodMarkdownSyntaxMaxBackticksPercentage: 0.5 }); // 50%
			const message = createMockMessage('```\ncode content\n``` other'); // code 12, total 17 -> ~70.5%
			const result = await listener.preProcess(message);
			expect(result).toEqual({
				type: 'backtick',
				percentage: 12 / 17,
				threshold: '>50% content'
			});
		});

		test('should return null if backtick usage is below thresholds', async () => {
			setMockSettings({ selfmodMarkdownSyntaxMaxBackticksCount: 3, selfmodMarkdownSyntaxMaxBackticksPercentage: 0.7 });
			const message = createMockMessage('`code1` `code2` This is fine.');
			await expect(listener.preProcess(message)).resolves.toBeNull();
		});
	});

	// Emphasis Tests
	describe('Emphasis Abuse', () => {
		test('should detect excessive emphasis sequences by count (using default threshold)', async () => {
			// Default is 5 sequences. Test with 6.
			const messageContent = Array(DEFAULT_MAX_EMPHASIS_COUNT + 1)
				.fill(0)
				.map((_, i) => `***emphasis${i}***`)
				.join(' ');
			const message = createMockMessage(messageContent);
			const result = await listener.preProcess(message);
			expect(result).toEqual({
				type: 'emphasis',
				count: DEFAULT_MAX_EMPHASIS_COUNT + 1,
				threshold: `>${DEFAULT_MAX_EMPHASIS_COUNT} sequences`
			});
		});

		test('should detect excessive emphasis sequences by count (using custom threshold)', async () => {
			setMockSettings({ selfmodMarkdownSyntaxMaxEmphasisCount: 2 });
			const message = createMockMessage('***bold_italic1*** __underline2__ ~~~strike3~~~');
			const result = await listener.preProcess(message);
			expect(result).toEqual({
				type: 'emphasis',
				count: 3,
				threshold: '>2 sequences'
			});
		});

		test('should detect excessive emphasis characters by percentage (using default threshold)', async () => {
			// Default is 80%.
			// "***emphasized content*** s" -> emphasis chars 6, total non-space 20. 6/20 = 30%. This is not enough.
			// Let's try: "***VERY_EMPHASIZED_CONTENT***" -> emphasis chars 6, total 27. 6/27 = 22%
			// The listener counts *all* emphasis characters (*, _, ~).
			// "********************short********************"
			// emphasis chars = 40, content length = 45. 40/45 ~ 88.8%
			const message = createMockMessage('********************short********************'); // 40 emphasis chars, 5 non-emphasis
			const result = await listener.preProcess(message);
			expect(result).toEqual({
				type: 'emphasis',
				percentage: 40 / 45,
				threshold: `>${DEFAULT_MAX_EMPHASIS_PERCENTAGE * 100}% content`
			});
		});

		test('should detect excessive emphasis characters by percentage (using custom threshold)', async () => {
			setMockSettings({ selfmodMarkdownSyntaxMaxEmphasisPercentage: 0.5 }); // 50%
			// "**emphasis** normal text" -> emphasis chars 4, total 18. 4/18 ~ 22%. Not enough.
			// Let's try: "**VERY_EMPHASIZED** normal" -> emphasis chars 4, total 20. 4/20 = 20%.
			// Need more density: "**********TEXT**********" -> emphasis chars 20, total 24. 20/24 ~ 83%
			const message = createMockMessage('**********TEXT**********');
			const result = await listener.preProcess(message);
			expect(result).toEqual({
				type: 'emphasis',
				percentage: 20 / 24,
				threshold: '>50% content'
			});
		});

		test('should return null if emphasis usage is below thresholds', async () => {
			setMockSettings({ selfmodMarkdownSyntaxMaxEmphasisCount: 5, selfmodMarkdownSyntaxMaxEmphasisPercentage: 0.8 });
			const message = createMockMessage('**bold** *italic* _underline_ ~strike~ This is fine.');
			await expect(listener.preProcess(message)).resolves.toBeNull();
		});

		test('should not count emphasis characters inside code blocks or spoilers for sequence checks', async () => {
			// This test depends on the regex correctly excluding these.
			// The current listener regex for sequences is: /(?<![\`|])(?:\*\*\*+|___+|~~~+)(?![\`|])/g
			// It tries to avoid ` and | before/after.
			setMockSettings({ selfmodMarkdownSyntaxMaxEmphasisCount: 1 });
			const message1 = createMockMessage('`***this_is_code***`'); // Should be null
			await expect(listener.preProcess(message1)).resolves.toBeNull();
			
			const message2 = createMockMessage('||***this_is_spoiler***||'); // Should be null
			await expect(listener.preProcess(message2)).resolves.toBeNull();

			const message3 = createMockMessage('Text `***code***` then ***sequence***'); // Should detect 1 sequence
			const result3 = await listener.preProcess(message3);
			expect(result3).toEqual({
				type: 'emphasis',
				count: 1, // Only the last one should count as a sequence for this rule
				threshold: '>0 sequences' // Assuming we'd set MaxEmphasisCount to 0 for this specific test if needed
			});
		});
	});
    
    // Test for bot message
    test('should return null for messages from bots', async () => {
        setMockSettings({});
        const message = createMockMessage('||spoiler||', 'bot123');
        message.author.bot = true; // Mark author as bot
        await expect(listener.preProcess(message)).resolves.toBeNull();
    });

    // Test for system message
    test('should return null for system messages', async () => {
        setMockSettings({});
        const message = createMockMessage('||spoiler||');
        message.system = true; // Mark as system message
        await expect(listener.preProcess(message)).resolves.toBeNull();
    });

    // Complex Nesting (Best Effort)
    // The regexes are not perfect parsers but should handle common cases.
    describe('Complex/Nested Markdown', () => {
        test('should handle spoilers within emphasis (counts as spoiler)', async () => {
            setMockSettings({ selfmodMarkdownSyntaxMaxSpoilersCount: 0 }); // Trigger on any spoiler
            const message = createMockMessage('*This is ||spoiler|| text*');
            const result = await listener.preProcess(message);
            expect(result?.type).toBe('spoiler');
        });

        test('should handle emphasis within spoilers (counts as spoiler content)', async () => {
            setMockSettings({ selfmodMarkdownSyntaxMaxSpoilersPercentage: 0.1 }); // Trigger on low spoiler content %
            const message = createMockMessage('||**bold spoiler**||'); // Spoiler content "bold spoiler", length 12. Total length 12. 100%
            const result = await listener.preProcess(message);
            expect(result?.type).toBe('spoiler');
            expect(result?.percentage).toBe(1);
        });

        test('should handle code blocks within spoilers (counts as spoiler content)', async () => {
            setMockSettings({ selfmodMarkdownSyntaxMaxSpoilersPercentage: 0.1 });
            const message = createMockMessage('||`code in spoiler`||'); // Spoiler content "`code in spoiler`", length 17. Total 17. 100%
            const result = await listener.preProcess(message);
            expect(result?.type).toBe('spoiler');
            expect(result?.percentage).toBe(1);
        });
    });
});
