import { ArgumentType, Command, CommandEvent, Controller, Group } from 'bancho';

@Group('random')
export class RandomController extends Controller {

	@Command({
		name: 'number',
		description: 'Generates a random number.',
		arguments: [
			{
				name: 'min',
				description: 'The minimum number to generate. [default: 0]',
				type: ArgumentType.Integer
			},
			{
				name: 'max',
				description: 'The maximum number to generate. [default: 100]',
				type: ArgumentType.Integer
			},
		]
	})
	public onRandomNumber(event: CommandEvent) {
		const min = event.getArgument<number>('min') ?? 0;
		const max = Math.max(event.getArgument<number>('max') ?? 100, min);
		const number = Math.floor((Math.random() * max) + min);

		return event.send(number.toLocaleString('en-US'));
	}

	@Command({
		name: 'coinflip',
		description: 'Flips a coin.'
	})
	public onCoinFlip(event: CommandEvent) {
		const coin = Math.random() < 0.5 ? 'Heads' : 'Tails';
		return event.send(coin + '.');
	}

}
