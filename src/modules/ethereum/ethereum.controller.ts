import { Command, ArgumentType, CommandEvent, Controller, Injectable, InvalidArgumentError } from 'bancho';
import { MessageEmbed } from 'discord.js';
import { EthereumService } from './ethereum.service';
import moment from 'moment';

@Injectable()
export class EthereumController extends Controller {

	public constructor(protected service: EthereumService) {
		super();
	}

	@Command({
		name: 'ether',
		description: 'Prints the current price of ether.',
		arguments: [
			{
				name: 'amount',
				description: 'The amount of ether to convert to dollars.',
				type: ArgumentType.String
			}
		],
	})
	public async onEtherPrice(event: CommandEvent) {
		if (event.hasArgument('amount')) {
			const amount = parseFloat(event.getArgument<string>('amount', true));

			if (isNaN(amount) || amount < 0.000001 || amount > 10000) {
				throw new InvalidArgumentError('Invalid amount.');
			}

			const ether = amount.toFixed(6);
			const dollars = this.service.getDollars(amount, true);

			return event.send(new MessageEmbed({
				color: 0x2f3136,
				fields: [
					{ name: 'Ether', value: ether, inline: true },
					{ name: '\u200b', value: '\u200b', inline: true },
					{ name: 'Dollars', value: '$' + dollars, inline: true }
				]
			}));
		}
		else {
			const usd = this.service.getDollars(1, true);

			const change1h = this.service.getPercentLastHour();
			const change24h = this.service.getPercentLastDay();
			const change7d = this.service.getPercentLastWeek();

			const color = this.service.getTickerColor();
			const emote = this.service.getTickerEmote();

			return event.send(new MessageEmbed({
				title: 'Ether ' + emote,
				color,
				fields: [
					{
						name: 'Current value',
						value: '$' + usd
					},

					{
						name: 'Last hour   󠀀󠀀',
						value: change1h,
						inline: true
					},
					{
						name: 'Today 󠀀󠀀   󠀀󠀀',
						value: change24h,
						inline: true
					},
					{
						name: 'This week',
						value: change7d,
						inline: true
					},
				],
			}));
		}
	}

}
