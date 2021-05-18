import { Module } from 'bancho';
import { BotUtilitiesController } from './controllers/bot.controller';
import { DictionaryController } from './controllers/dictionary.controller';
import { RandomController } from './controllers/random.controller';
import { UserUtilitiesController } from './controllers/user.controller';

@Module({
	name: 'utilities',
	controllers: [
		UserUtilitiesController,
		BotUtilitiesController,
		DictionaryController,
		RandomController
	],
	services: []
})
export class UtilitiesModule {}
