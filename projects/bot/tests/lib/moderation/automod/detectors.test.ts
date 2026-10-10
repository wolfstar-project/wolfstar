import {
	WindowCounter,
	countEmojis,
	countLinks,
	countRepeats,
	hasMaskedLink,
	hasSpoiler,
	isSpoilerAttachment
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
});
