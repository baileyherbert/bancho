import { Module } from 'bancho';
import { YouTubeService } from './youtube.service';

@Module({
	name: 'youtube',
	services: [YouTubeService]
})
export class YouTubeModule {}
