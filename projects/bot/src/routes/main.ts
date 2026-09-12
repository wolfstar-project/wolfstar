import { ApiRequest, ApiResponse, Route } from '@wolfstar/plugin-api';

export class UserRoute extends Route {
	public constructor(context: Route.LoaderContext) {
		super(context, { route: '/', methods: ['GET'] });
	}

	public run(_request: ApiRequest, response: ApiResponse) {
		return response.json({ message: 'Hello World' });
	}
}
