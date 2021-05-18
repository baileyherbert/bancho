import { Module } from 'bancho';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';

@Module({
	name: 'weather',
	controllers: [WeatherController],
	services: [WeatherService]
})
export class WeatherModule {}
