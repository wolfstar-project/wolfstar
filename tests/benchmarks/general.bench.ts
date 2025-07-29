import { describe, test, expect } from 'vitest';
import * as utils from '#utils/util';
import { createUser } from '../mocks/MockInstances.js';

// Benchmark semplificato che usa i test di vitest per misurare le prestazioni
describe('Performance Benchmarks', () => {
	const iterations = 10000;

	describe('extractDetailedMentions', () => {
		const simpleText = 'Hello world';
		const complexText = '<@268792781713965056> sent a message in <#541740581832097792> mentioning <@&541739191776575502>! @everyone';

		test('simple text performance', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				utils.extractDetailedMentions(simpleText);
			}
			const end = performance.now();
			console.log(`Simple text: ${iterations} iterations took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(1000); // Should complete within 1 second
		});

		test('complex text performance', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				utils.extractDetailedMentions(complexText);
			}
			const end = performance.now();
			console.log(`Complex text: ${iterations} iterations took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(2000); // Should complete within 2 seconds
		});
	});

	describe('parseRange', () => {
		test('simple range performance', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				utils.parseRange('1..5');
			}
			const end = performance.now();
			console.log(`Simple range: ${iterations} iterations took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(1000);
		});

		test('complex range performance', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				utils.parseRange('1..5,10..12,20..25,30..35');
			}
			const end = performance.now();
			console.log(`Complex range: ${iterations} iterations took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(2000);
		});
	});

	describe('getDisplayAvatar', () => {
		const userNoAvatar = createUser({ discriminator: '0001', avatar: null });
		const userStaticAvatar = createUser({
			discriminator: '0001',
			avatar: '09b52e547fa797c47c7877cd10eb6ba8'
		});
		const userAnimatedAvatar = createUser({
			discriminator: '0001',
			avatar: 'a_e583ad02d90ca9a5431bccec6c17b348'
		});

		test('no avatar performance', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				utils.getDisplayAvatar(userNoAvatar);
			}
			const end = performance.now();
			console.log(`No avatar: ${iterations} iterations took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(1000);
		});

		test('static avatar performance', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				utils.getDisplayAvatar(userStaticAvatar);
			}
			const end = performance.now();
			console.log(`Static avatar: ${iterations} iterations took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(1000);
		});

		test('animated avatar performance', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				utils.getDisplayAvatar(userAnimatedAvatar);
			}
			const end = performance.now();
			console.log(`Animated avatar: ${iterations} iterations took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(1000);
		});
	});

	describe('getImageUrl', () => {
		const validUrls = ['https://example.com/image.png', 'https://example.com/image.jpg', 'https://example.com/image.webp'];

		const invalidUrls = ['https://example.com/image.mp4', 'invalid-url', 'https://example.com/document.pdf'];

		test('valid URLs performance', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				validUrls.forEach((url) => utils.getImageUrl(url));
			}
			const end = performance.now();
			console.log(`Valid URLs: ${iterations * validUrls.length} calls took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(2000);
		});

		test('invalid URLs performance', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				invalidUrls.forEach((url) => utils.getImageUrl(url));
			}
			const end = performance.now();
			console.log(`Invalid URLs: ${iterations * invalidUrls.length} calls took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(2000);
		});
	});

	describe('Array Operations', () => {
		const smallArray = [1, 2, 3, 4, 5];
		const mediumArray = Array.from({ length: 100 }, (_, i) => i);
		const largeArray = Array.from({ length: 1000 }, (_, i) => i);

		test('pickRandom small array', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				utils.pickRandom(smallArray);
			}
			const end = performance.now();
			console.log(`pickRandom small: ${iterations} iterations took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(1000);
		});

		test('pickRandom medium array', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				utils.pickRandom(mediumArray);
			}
			const end = performance.now();
			console.log(`pickRandom medium: ${iterations} iterations took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(1000);
		});

		test('pickRandom large array', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				utils.pickRandom(largeArray);
			}
			const end = performance.now();
			console.log(`pickRandom large: ${iterations} iterations took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(2000);
		});

		test('shuffle small array', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				utils.shuffle([...smallArray]);
			}
			const end = performance.now();
			console.log(`shuffle small: ${iterations} iterations took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(1000);
		});

		test('shuffle medium array', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				utils.shuffle([...mediumArray]);
			}
			const end = performance.now();
			console.log(`shuffle medium: ${iterations} iterations took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(2000);
		});

		test('shuffle large array', () => {
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				utils.shuffle([...largeArray]);
			}
			const end = performance.now();
			console.log(`shuffle large: ${iterations} iterations took ${(end - start).toFixed(2)}ms`);
			expect(end - start).toBeLessThan(4000);
		});
	});
});
