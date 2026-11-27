import { getOnboardingCaptchaUrl, renderOnboardingNotice, renderOnboardingNoticeUpdate } from '#lib/onboarding/render';
import { ButtonStyle, ComponentType } from 'discord-api-types/v10';

const guildId = '254360814063058944';

describe('renderOnboardingNotice', () => {
	test('GIVEN the link to the captcha THEN the button opens the verification page of the guild', () => {
		const url = getOnboardingCaptchaUrl(guildId);
		const notice = renderOnboardingNotice('Pass the captcha.', { kind: 'Link', label: 'Open the captcha', url });

		expect(url).toMatch(new RegExp(`^https?://[^/]+/verify/${guildId}$`));
		expect(notice.components).toEqual([
			{
				type: ComponentType.ActionRow,
				components: [{ type: ComponentType.Button, style: ButtonStyle.Link, label: 'Open the captcha', url }]
			}
		]);
	});

	test('GIVEN an action THEN the button is one of the bot, in the notice and in its update', () => {
		const button = { kind: 'Action', label: 'Continue', customId: 'onboarding.start' } as const;
		const expected = { type: ComponentType.Button, style: ButtonStyle.Primary, label: 'Continue', custom_id: 'onboarding.start' };

		expect(renderOnboardingNotice('Next.', button).components[0]?.components).toEqual([expected]);
		expect(renderOnboardingNoticeUpdate('Next.', button).components?.[1]).toEqual({ type: ComponentType.ActionRow, components: [expected] });
	});
});
