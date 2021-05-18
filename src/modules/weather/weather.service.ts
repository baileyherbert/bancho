import { Service, Task, TaskEvent, UserError } from 'bancho';
import moment from 'moment';
import fetch from 'node-fetch';

export class WeatherService extends Service {

	public config = this.createConfig<WeatherConfig>({
		key: 'OPENWEATHERAPI_KEY'
	});

	/**
	 * Returns information about the current weather at the specified location.
	 *
	 * @param location
	 * @returns
	 */
	public async getWeather(location: string) {
		const data = await this._getWeatherData(location, 'weather');

		// Get icon and color for the embed
		const icon = icons[data.weather[0].icon.replace(/[dn]/, '')];
		const color = colors[data.weather[0].icon.replace(/[dn]/, '')];

		// Calculate wind
		const wind = `${Math.floor(data.wind.speed + 0.5)} mph`;

		// Capitalize the description
		const description = data.weather[0].description.substring(0, 1).toUpperCase()
			+ data.weather[0].description.substring(1);

		return {
			locationName: data.name,
			locationDescription: description,
			icon,
			color,
			temperature: Math.floor(data.main.temp + 0.5).toString(),
			humidity: data.main.humidity.toFixed(0),
			wind
		};
	}

	/**
	 * Returns information about the weather forecast at the specified location.
	 *
	 * @param location
	 */
	public async getForecast(location: string) {
		const currentData = await this._getWeatherData(location, 'weather');
		const forecastData = await this._getWeatherData(location, 'forecast');
		const dates = new Map<string, ForecastDay>();

		// Add today's weather to the beginning

		const currentTime = moment();
		const currentDate = currentTime.format('MM/DD');

		dates.set(currentDate, this._getForecastDay(currentTime, currentData));

		// The forecast data we receive is a list of weather at several times throughout the next several days
		// We should go through the times in each day and pick out the most notable weather to display

		for (const forecast of forecastData.list) {
			const forecastTime = moment.unix(forecast.dt);
			const forecastDate = forecastTime.format('MM/DD');
			const weather = forecast.weather[0];

			// Check for duplicate dates
			if (dates.has(forecastDate)) {
				const existing = dates.get(forecastDate)!;
				const existingPriority = Math.max(priorities.indexOf(existing.overview), 0);
				const newPriority = Math.max(priorities.indexOf(weather.main), 0);

				// Replace the data if the new priority is higher
				if (newPriority > existingPriority) {
					existing.overview = weather.main;
					existing.icon = icons[weather.icon.replace(/[dn]/, '')];
				}

				// Update temperature ranges
				existing.temperature.max = Math.max(existing.temperature.max, forecast.main.temp_max);
				existing.temperature.min = Math.min(existing.temperature.min, forecast.main.temp_min);
			}

			// Add new dates
			else {
				dates.set(forecastDate, this._getForecastDay(forecastTime, forecast));
			}
		}

		return {
			locationName: currentData.name,
			locationId: currentData.id,
			dates: [...dates.values()]
		};
	}

	/**
	 * Downloads, parses, and returns weather data for the given location.
	 *
	 * @param location
	 * @param type
	 * @returns
	 */
	private async _getWeatherData(location: string, type: 'weather'): Promise<WeatherResponse>;
	private async _getWeatherData(location: string, type: 'forecast'): Promise<ForecastResponse>;
	private async _getWeatherData(location: string, type: 'weather' | 'forecast'): Promise<any> {
		if (this.config.value.key === 'OPENWEATHERAPI_KEY') {
			throw new UserError('This bot is not configured for weather!');
		}

		// Limit to the United States unless otherwise specified
		if (location.indexOf(',') < 0) {
			location += ',US';
		}

		// Format the URL
		const key = this.config.value.key;
		const query = encodeURIComponent(location);
		const url = `https://api.openweathermap.org/data/2.5/${type}?q=${query}&appid=${key}&units=imperial`;

		// Execute the request
		const response = await fetch(url);
		const data = await response.json();

		// Handle not found errors
		if ('cod' in data && data.cod == '404') {
			throw new UserError(data.message.substring(0, 1).toUpperCase() + data.message.substring(1));
		}

		return data;
	}

	private _getForecastDay(date: moment.Moment, data: WeatherData): ForecastDay {
		return {
			time: date,
			overview: data.weather[0].main,
			icon: icons[data.weather[0].icon.replace(/[dn]/, '')],
			color: colors[data.weather[0].icon.replace(/[dn]/, '')],
			temperature: {
				min: data.main.temp_min,
				max: data.main.temp_max
			}
		}
	}

}

const icons: { [id: string]: string } = {
    '01': ':sunny:',
    '02': ':white_sun_small_cloud:',
    '03': ':cloud:',
    '04': ':cloud:',
    '09': ':cloud_rain:',
    '10': ':white_sun_rain_cloud:',
    '11': ':thunder_cloud_rain:',
    '13': ':cloud_snow:',
    '50': ':foggy:'
};

const colors: { [id: string]: number } = {
    '01': 0xffac33,
    '02': 0xffac33,
    '03': 0xeeeeee,
    '04': 0xeeeeee,
    '09': 0x5dadec,
    '10': 0x5dadec,
    '11': 0xf4900c,
    '13': 0x88c9f9
};

const priorities = [
    'Clear',
    'Clouds',
    'Dust',
    'Mist',
    'Smoke',
    'Haze',
    'Fog',
    'Sand',
    'Drizzle',
    'Rain',
    'Snow',
    'Thunderstorm',
    'Ash',
    'Tornado'
];

interface WeatherConfig {
	key: string;
}

interface WeatherData {
	weather: {
        main: string;
        description: string;
        icon: string;
    }[];
    main: {
        temp: number;
        pressure: number;
        humidity: number;
        temp_min: number;
        temp_max: number;
    };
    wind: {
        speed: number;
        deg: number;
    };
}

interface WeatherResponse extends WeatherData {
	name: string;
	id: number;
    cod: string;
    message: string;
}

interface ForecastResponse {
	cod: string;
    message: string;
    cnt: number;
    list: (WeatherData & {
        dt: number;
        dt_txt: string;
    })[];
    city: {
        name: string;
    }
}

interface ForecastDay {
    time: moment.Moment;
    icon: string;
	color: number;
    overview: string;
    temperature: {
        min: number;
        max: number;
    };
}
