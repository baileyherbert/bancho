import { ArgumentType, Command, CommandEvent, Controller, Injectable } from 'bancho';
import { EmbedFieldData, MessageEmbed } from 'discord.js';
import { WeatherService } from './weather.service';

@Injectable()
export class WeatherController extends Controller {

	public constructor(protected service: WeatherService) {
		super();
	}

	@Command({
		name: 'weather',
		description: 'Shows the current weather for the given location.',
		arguments: [
			{
				name: 'location',
				description: 'The name or postal code to search for.',
				type: ArgumentType.String,
				required: true
			}
		]
	})
	public async onWeather(event: CommandEvent) {
		const weather = await this.service.getWeather(event.getArgument('location', true));

		return event.send(new MessageEmbed({
			title: `Weather for ${weather.locationName}`,
			description: `${weather.icon}  ${weather.locationDescription}\n\u200b`,
			color: weather.color,
			fields: [
				{
					name: 'Temperature  󠀀󠀀',
					value: `${weather.temperature} °F`,
					inline: true
				},
				{
					name: 'Humidity  󠀀󠀀',
					value: `${weather.humidity}%`,
					inline: true
				},
				{
					name: 'Wind',
					value: weather.wind,
					inline: true
				}
			]
		}));
	}

	@Command({
		name: 'forecast',
		description: 'Shows the 5-day weather forecast for the given location.',
		arguments: [
			{
				name: 'location',
				description: 'The name or postal code to search for.',
				type: ArgumentType.String,
				required: true
			}
		]
	})
	public async onForecast(event: CommandEvent) {
		const forecast = await this.service.getForecast(event.getArgument('location', true));
		const color = forecast.dates[0].color;
		const fields = new Array<EmbedFieldData>();

		for (const date of forecast.dates) {
			const temperature = Math.floor(0.5 + date.temperature.max);

			const lines = [
				`**${date.time.format('dddd')}**`,
				date.overview,
				`${temperature} °F`
			];

			fields.push({
				name: date.icon,
				value: lines.join('\n') + (fields.length < 3 ? '\n\u200b' : ''),
				inline: true
			});
		}

		const description = 'Here is an overview of the forecast for the next five days.\n' +
			`[Click here](https://openweathermap.org/city/${forecast.locationId}) to see the full forecast.\n\u200b`;

		return event.send(new MessageEmbed({
			title: forecast.locationName,
			description,
			color,
			fields
		}));
	}

	private test() {

	}

}
