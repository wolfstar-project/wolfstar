import type { ApiRequest, ApiResponse } from '@wolfstar/plugin-api';
import { Route } from '@wolfstar/plugin-api';

export class UserRoute extends Route {
	public run(_request: ApiRequest, response: ApiResponse) {
		response.json({ message: 'Hello World' });
	}
}
