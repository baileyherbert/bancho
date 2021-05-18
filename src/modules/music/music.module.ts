import { Module } from 'bancho';
import { MusicController } from './music.controller';

@Module({
	name: 'music',
	controllers: [MusicController],
	services: []
})
export class MusicModule {}
