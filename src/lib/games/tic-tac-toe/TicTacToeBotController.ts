import { BaseBotController } from '#lib/games/base/BaseBotController';
import type { TicTacToeGame } from '#lib/games/tic-tac-toe/TicTacToeGame';
import { cast } from '#utils/util';
import { TicTacToe } from '@skyra/ai';

export class TicTacToeBotController extends BaseBotController<number> {
	public await(): number {
		const game = cast<TicTacToeGame>(this.game);
		const ai = new TicTacToe(game.board);
		return ai.getBestMove();
	}
}
