import type { GuildMessage } from '#lib/types';
import { formatMessage } from '#utils/formatters';
import { container } from '@wolfstar/http-framework';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import { EmbedType, type APIMessage } from 'discord-api-types/v10';
import { createMessage as createGuildMessage } from '../mocks/MockInstances.js';

describe('formatters', () => {
	describe('formatMessage', () => {
		beforeAll(() => container.i18n.init());

		function createMessage(data: Partial<APIMessage> = {}): GuildMessage {
			return createGuildMessage(data) as GuildMessage;
		}

		function t() {
			return container.i18n.getT('en-US') as TFunction<AnyNamespace>;
		}

		function join(...parts: string[]) {
			return parts.join('\n');
		}

		test('GIVEN empty message THEN returns header only', async () => {
			const message = createMessage();

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					''
				)
			);
		});

		test('GIVEN content only THEN returns content only', async () => {
			const message = createMessage({ content: 'Hello World' });

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'> Hello World'
				)
			);
		});

		test('GIVEN content only with block quotes THEN returns content only with nested block quotes', async () => {
			const message = createMessage({ content: '> Block Quotes!' });

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'> > Block Quotes!'
				)
			);
		});

		test('GIVEN embed title only THEN returns embed title only', async () => {
			const message = createMessage({ embeds: [{ title: 'Your Title Goes Here' }] });

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'># Your Title Goes Here'
				)
			);
		});

		test('GIVEN embed author only THEN returns embed author only', async () => {
			const message = createMessage({
				embeds: [{ author: { name: 'Skyra', icon_url: 'https://skyra.pw/avatars/skyra.png', url: 'https://skyra.pw' } }]
			});

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'> 👤 [https://skyra.pw/avatars/skyra.png] Skyra <https://skyra.pw>'
				)
			);
		});

		test('GIVEN embed author with name only THEN returns embed author with name only', async () => {
			const message = createMessage({ embeds: [{ author: { name: 'Skyra' } }] });

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'> 👤 Skyra'
				)
			);
		});

		test('GIVEN embed author with iconURL only THEN returns embed author with iconURL only', async () => {
			const message = createMessage({ embeds: [{ author: { name: '', icon_url: 'https://skyra.pw/avatars/skyra.png' } }] });

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'> 👤 [https://skyra.pw/avatars/skyra.png] -'
				)
			);
		});

		test('GIVEN embed description only THEN returns embed description only', async () => {
			const message = createMessage({ embeds: [{ description: 'Hello!' }] });

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'> > Hello!'
				)
			);
		});

		test('GIVEN embed with one field only THEN returns embed with one field only', async () => {
			const message = createMessage({ embeds: [{ fields: [{ name: 'Hello', value: 'World!' }] }] });

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'> #> Hello',
					'>  > World!'
				)
			);
		});

		test('GIVEN embed with two fields THEN returns embed with two fields', async () => {
			const message = createMessage({
				embeds: [
					{
						fields: [
							{ name: 'Hello', value: 'World!' },
							{ name: 'Foo', value: 'Bar' }
						]
					}
				]
			});

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'> #> Hello',
					'>  > World!',
					'> #> Foo',
					'>  > Bar'
				)
			);
		});

		test('GIVEN embed with description and two fields THEN returns embed with description and two fields', async () => {
			const message = createMessage({
				embeds: [
					{
						description: 'This is a description!',
						fields: [
							{ name: 'Hello', value: 'World!' },
							{ name: 'Foo', value: 'Bar' }
						]
					}
				]
			});

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'> > This is a description!',
					'> #> Hello',
					'>  > World!',
					'> #> Foo',
					'>  > Bar'
				)
			);
		});

		test('GIVEN embed with image only THEN returns embed with image only', async () => {
			const message = createMessage({ embeds: [{ image: { url: 'https://skyra.pw/avatars/skyra.png' } }] });

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'>🖼️ [https://skyra.pw/avatars/skyra.png]'
				)
			);
		});

		test('GIVEN embed footer with text only THEN returns embed footer with text only', async () => {
			const message = createMessage({ embeds: [{ footer: { text: 'Your Footer!' } }] });

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'>_ Your Footer!'
				)
			);
		});

		test('GIVEN embed footer with icon only THEN returns embed footer with icon only', async () => {
			const message = createMessage({ embeds: [{ footer: { icon_url: 'https://skyra.pw/avatars/skyra.png', text: '' } }] });

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'>_ [https://skyra.pw/avatars/skyra.png]'
				)
			);
		});

		test('GIVEN embed footer with icon and text THEN returns embed footer with icon and text', async () => {
			const message = createMessage({ embeds: [{ footer: { icon_url: 'https://skyra.pw/avatars/skyra.png', text: 'Yes, that is me!' } }] });

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'>_ [https://skyra.pw/avatars/skyra.png] - Yes, that is me!'
				)
			);
		});

		test('GIVEN image embed THEN returns image embed', async () => {
			const message = createMessage({
				embeds: [
					{
						type: EmbedType.Image,
						url: 'https://media.discordapp.net/attachments/758186338217492503/825157377090912296/birdflip2.gif',
						thumbnail: {
							url: 'https://media.discordapp.net/attachments/758186338217492503/825157377090912296/birdflip2.gif',
							proxy_url:
								'https://images-ext-2.discordapp.net/external/nFHEK4-YMyLCGsv4MbtTgwxCudyi3Q6jezLx4cLdfOc/https/media.discordapp.net/attachments/758186338217492503/825157377090912296/birdflip2.gif',
							width: 494,
							height: 368
						}
					}
				]
			});

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'> 📎 https://media.discordapp.net/attachments/758186338217492503/825157377090912296/birdflip2.gif'
				)
			);
		});

		test('GIVEN video embed THEN returns video embed', async () => {
			const message = createMessage({
				embeds: [
					{
						type: EmbedType.Video,
						url: 'https://www.youtube.com/watch?v=5dqixBi8TPU',
						title: "LADY'S ONLY feat. Marpril - Throwback",
						description:
							"ハッとした時の冷却。\n\n【Throwback】\n\nVocal ：Marpril \n立花鈴\nhttps://twitter.com/Rin04ple\n谷田透佳\nhttps://twitter.com/Touka03mar\n\nMusic：LADY'S ONLY\nhttps://twitter.com/LADY50NLY\n\nLyric：uyuni\nhttps://twitter.com/uyn_yn\n\nChoreographer：ALEXANDER KAWAMOTO(アレックス) \nhttps://www.instagram.com/alex_kwmt/ \n\nMovie：ノノル ／ ヲタきち\nThrowback ロゴデザイン　チョロみ\nhttps://twitter.com/nonolu41...",
						color: 16711680,
						author: {
							name: 'Marpril Channel',
							url: 'https://www.youtube.com/channel/UCWhv732tk4DAQ7X32qHKrfA'
						},
						provider: {
							name: 'YouTube',
							url: 'https://www.youtube.com'
						},
						thumbnail: {
							url: 'https://i.ytimg.com/vi/5dqixBi8TPU/maxresdefault.jpg',
							proxy_url:
								'https://images-ext-1.discordapp.net/external/gk1nrmD5dvvSyYrFm1tMGNOm6f80Ps1hyX8zf9bYImw/https/i.ytimg.com/vi/5dqixBi8TPU/maxresdefault.jpg',
							width: 1280,
							height: 720
						},
						video: {
							url: 'https://www.youtube.com/embed/5dqixBi8TPU',
							width: 1280,
							height: 720
						}
					}
				]
			});

			expect(await formatMessage(t(), message)).toBe(
				join(
					'[3/26/21, 10:29:51 PM] Skyra#7023 [BOT]', //
					'🔖 [https://www.youtube.com/watch?v=5dqixBi8TPU] (YouTube).'
				)
			);
		});
	});
});
