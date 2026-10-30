import {
	getMessageSpamCounterKey,
	WindowCounter,
	countEmojis,
	countLinks,
	countRepeats,
	hasMaskedLink,
	hasSpoiler,
	isSpoilerAttachment,
	pushMessageContent
} from '#lib/moderation/automod/detectors';

describe('auto-moderation detectors', () => {
	describe('countRepeats', () => {
		test('GIVEN a character repeated in a row THEN its run is counted, whatever the case', () => {
			expect(countRepeats('aaaaAAAAaaaaaa').characters).toBe(14);
			expect(countRepeats('hello').characters).toBe(2);
		});

		test('GIVEN a word repeated in a row THEN its run is counted', () => {
			expect(countRepeats('word word Word  word\nword word word').words).toBe(7);
			expect(countRepeats('one two one two').words).toBe(1);
		});

		test('GIVEN spaces in a row THEN they are not a run', () => {
			expect(countRepeats('a          b')).toEqual({ characters: 1, words: 1 });
			expect(countRepeats('')).toEqual({ characters: 0, words: 0 });
		});
	});

	describe('countEmojis', () => {
		test('GIVEN emojis of Discord and of Unicode THEN each is counted once', () => {
			expect(countEmojis('hi <:wolf:1557124128337829937> <a:spin:1557124128337829938> 😀🎉')).toBe(4);
		});

		test('GIVEN a sequence THEN it is one emoji', () => {
			expect(countEmojis('👨‍👩‍👧')).toBe(1);
			expect(countEmojis('👍🏽')).toBe(1);
			expect(countEmojis('🇮🇹')).toBe(1);
		});

		test('GIVEN no emoji THEN there is none', () => {
			expect(countEmojis('just text, 123 and #tags')).toBe(0);
		});
	});

	describe('countLinks', () => {
		test('GIVEN links THEN they are counted', () => {
			expect(countLinks('see https://wolfstar.rocks and http://example.com/page, not example.org')).toBe(2);
			expect(countLinks('nothing here')).toBe(0);
		});
	});

	describe('spoilers', () => {
		test('GIVEN a hidden text THEN it is a spoiler', () => {
			expect(hasSpoiler('the end is ||everyone lives||')).toBe(true);
			expect(hasSpoiler('a || b')).toBe(false);
			expect(hasSpoiler('||||')).toBe(false);
		});

		test('GIVEN the name of an attachment THEN its prefix tells', () => {
			expect(isSpoilerAttachment('SPOILER_image.png')).toBe(true);
			expect(isSpoilerAttachment('image.png')).toBe(false);
			expect(isSpoilerAttachment(null)).toBe(false);
		});
	});

	describe('hasMaskedLink', () => {
		test('GIVEN a link shown as another text THEN it is found', () => {
			expect(hasMaskedLink('claim it [here](https://example.com/gift)')).toBe(true);
			expect(hasMaskedLink('[steam](<https://example.com> "title")')).toBe(true);
		});

		test('GIVEN a plain link, or brackets without one THEN it is not', () => {
			expect(hasMaskedLink('https://example.com')).toBe(false);
			expect(hasMaskedLink('[note] (see above)')).toBe(false);
			expect(hasMaskedLink('[text](not a link)')).toBe(false);
		});
	});

	describe('WindowCounter', () => {
		test('GIVEN hits within the window THEN they add up by key', () => {
			const counter = new WindowCounter(10_000);

			expect(counter.add('a', 1, 1000)).toBe(1);
			expect(counter.add('a', 2, 2000)).toBe(3);
			expect(counter.add('b', 1, 2000)).toBe(1);
		});

		test('GIVEN hits older than the window THEN they no longer count', () => {
			const counter = new WindowCounter(10_000);
			counter.add('a', 5, 1000);

			expect(counter.add('a', 1, 11_000)).toBe(1);
		});

		test('GIVEN a key that was reset THEN it starts over', () => {
			const counter = new WindowCounter(10_000);
			counter.add('a', 5, 1000);
			counter.reset('a');

			expect(counter.add('a', 1, 1500)).toBe(1);
		});
	});

	describe('getMessageSpamCounterKey', () => {
		test('GIVEN a rule that counts each member THEN two members of a channel are counted apart', () => {
			expect(getMessageSpamCounterKey(false, '1', '10')).not.toBe(getMessageSpamCounterKey(false, '1', '11'));
			expect(getMessageSpamCounterKey(false, '1', '10')).not.toBe(getMessageSpamCounterKey(false, '2', '10'));
		});

		test('GIVEN a rule that counts the whole channel THEN its members are counted together, and the channels apart', () => {
			expect(getMessageSpamCounterKey(true, '1', '10')).toBe(getMessageSpamCounterKey(true, '1', '11'));
			expect(getMessageSpamCounterKey(true, '1', '10')).not.toBe(getMessageSpamCounterKey(true, '2', '10'));
		});
	});
	describe('pushMessageContent', () => {
		test('GIVEN repeated messages THEN each counts the ones the queue holds, itself included', () => {
			const contents: string[] = [];
			expect(['a', 'b', 'a', 'a'].map((content) => pushMessageContent(contents, content, 4))).toEqual([1, 1, 2, 3]);
		});

		test('GIVEN a full queue THEN the oldest message leaves it', () => {
			const contents: string[] = [];
			for (const content of ['a', 'a', 'c', 'c', 'c']) pushMessageContent(contents, content, 3);
			expect(contents).toEqual(['c', 'c', 'c']);
			expect(pushMessageContent(contents, 'a', 3)).toBe(1);
		});

		test('GIVEN another case THEN the messages are the same', () => {
			const contents: string[] = [];
			pushMessageContent(contents, 'Hello', 3);
			expect(pushMessageContent(contents, 'HELLO', 3)).toBe(2);
		});
	});
});
