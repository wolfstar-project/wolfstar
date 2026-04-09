import { BaseBotController } from '#lib/games/base/BaseBotController';
import type { ConnectFourGame } from '#lib/games/connect-four/ConnectFourGame';
import { cast } from '#utils/util';
import { ConnectFour } from '@skyra/ai';

export class ConnectFourBotController extends BaseBotController<number> {
	private readonly depth: number;

	public constructor(depth: number) {
		super();
		this.depth = depth;
	}

	public await(): number {
		const game = cast<ConnectFourGame>(this.game);
		const ai = new ConnectFour(game.board);
		return ai.getBestMove(this.depth);
	}
}
