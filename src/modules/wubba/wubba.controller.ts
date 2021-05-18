import { ArgumentType, Command, CommandEvent, Controller, Group } from 'bancho';

@Group('wubba')
export class WubbaController extends Controller {

	@Command({
		name: 'lookup',
		description: 'Look up information about a player.',
		arguments: [
			{
				name: 'player',
				description: 'Link to a steam profile or a steam ID.',
				type: ArgumentType.String,
				required: true
			}
		]
	})
	public async onLookup(event: CommandEvent) {
		return event.send('Not implemented.');
	}

	@Command({
		name: 'add',
		description: 'Adds a player to the cheater database.',
		arguments: [
			{
				name: 'player',
				description: 'Link to a steam profile or a steam ID.',
				type: ArgumentType.String,
				required: true
			}
		]
	})
	public async onRegisterCheater(event: CommandEvent) {
		return event.send('Not implemented.');
	}

	@Command({
		name: 'remove',
		description: 'Removes a player from the cheater database.',
		arguments: [
			{
				name: 'player',
				description: 'Link to a steam profile or a steam ID.',
				type: ArgumentType.String,
				required: true
			}
		]
	})
	public async onDeregisterCheater(event: CommandEvent) {
		return event.send('Not implemented.');
	}

	@Command({
		name: 'ragequits',
		description: 'Shows our recent ragequit statistics.',
	})
	public async onShowRagequits(event: CommandEvent) {
		return event.send('Not implemented.');
	}

	@Command({
		name: 'stats',
		description: 'Shows overall cheater statistics.',
	})
	public async onShowStatistics(event: CommandEvent) {
		return event.send('Not implemented.');
	}

	@Command({
		name: 'ip',
		description: 'Gets the current server IP address.',
	})
	public async onGetAddress(event: CommandEvent) {
		return event.send('Not implemented.');
	}

}
