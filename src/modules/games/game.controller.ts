import { Command, CommandEvent, Controller, Group } from 'bancho';

@Group('game')
export class GameController extends Controller {

	@Command({
		name: 'race',
		description: 'Play an animal race with friends.',
	})
	public async onRace(event: CommandEvent) {
		return event.send('Not implemented.');
	}

	@Command({
		name: 'tictactoe',
		description: 'Play a game of tic tac toe with a friend.',
	})
	public async onTicTacToe(event: CommandEvent) {
		return event.send('Not implemented.');
	}

	@Command({
		name: 'connectfour',
		description: 'Play a game of connect four with a friend.',
	})
	public async onConnectFour(event: CommandEvent) {
		return event.send('Not implemented.');
	}

}
