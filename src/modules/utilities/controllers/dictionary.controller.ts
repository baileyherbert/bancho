import { ArgumentType, Command, CommandEvent, Controller } from 'bancho';
import { MessageEmbed } from 'discord.js';
import fetch from 'node-fetch';

export class DictionaryController extends Controller {

	@Command({
		name: 'urban',
		description: 'Look up a definition from Urban Dictionary!',
		arguments: [
			{
				name: 'query',
				description: 'The word or phrase to search.',
				required: true,
				type: ArgumentType.String
			}
		]
	})
	public async onDefineUrban(event: CommandEvent) {
		const query = encodeURI(event.getArgument<string>('query', true));
		const res = await fetch('https://api.urbandictionary.com/v0/define?term=' + query);
		const data = await res.json();
		const items = data.list;

		if (items.length > 0) {
			let definition = items[0].definition.replace(/\[([\w\s\d\.\-\']+)\]/g, '$1') as string;

			// Ensure the definition ends with a period
			if (/[a-zA-Z0-9]$/.test(definition)) {
				definition += '.';
			}

			// Ensure the definition does not exceed 2048 characters
			if (definition.length > 2048) {
				definition = definition.substring(0, 2044) + ' ...';
			}

			// Send definition
			return event.send(new MessageEmbed({
				title: `${items[0].word}`,
				author: {
					icon_url: 'https://firebounty.com/image/635-urban-dictionary',
					name: 'Urban Dictionary'
				},
				description: definition,
				url: `https://www.urbandictionary.com/define.php?term=${query}`,
				color: 0xf25a2c
			}));
		}
		else {
			return event.send(`I couldn't find a definition.`);
		}
	}

	@Command({
		name: 'define',
		description: 'Look up the definition of a word in a real dictonary.',
		arguments: [
			{
				name: 'query',
				description: 'The word or phrase to search.',
				required: true,
				type: ArgumentType.String
			}
		]
	})
	public async onDefineReal(event: CommandEvent) {
		const query = encodeURI(event.getArgument<string>('query', true));

		// TODO: Do it later
	}

}
