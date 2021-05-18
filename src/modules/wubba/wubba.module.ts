import { Module } from 'bancho';
import { WubbaController } from './wubba.controller';
import { WubbaService } from './wubba.service';

@Module({
	name: 'wubba',
	controllers: [WubbaController],
	services: [WubbaService]
})
export class WubbaModule {}
