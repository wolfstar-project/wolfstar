import { Urls } from '#utils/constants';
import { envParseString } from '@wolfstar/env-utilities';

/**
 * The website the links the bot writes lead to: an appeal, the checkpoint of the join guard, a dashboard. It is the
 * origin the API answers (`API_ORIGIN`), which has to be the website for the website to call it, so a bot that pairs with
 * another website (the alpha one, a local one) links there and not to the production website. When the API answers any
 * origin (`*`, the default) or `API_ORIGIN` is not a URL, it is {@linkcode Urls.Website}.
 */
export function getWebsiteUrl(): string {
	const origin = envParseString('API_ORIGIN', '*');
	if (!URL.canParse(origin)) return Urls.Website;

	const url = new URL(origin);
	return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : Urls.Website;
}
