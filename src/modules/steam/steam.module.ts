import { Module } from 'bancho';
import { SteamService } from './steam.service';

@Module({
	name: 'steam',
	controllers: [],
	services: [SteamService]
})
export class SteamModule {}
