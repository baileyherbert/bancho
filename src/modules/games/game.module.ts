import { Module } from 'bancho';
import { GameController } from './game.controller';

@Module({
	name: 'games',
	controllers: [GameController],
	services: []
})
export class GameModule {}
