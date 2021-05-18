import { Module } from 'bancho';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
	name: 'tracking',
	controllers: [TrackingController],
	services: [TrackingService]
})
export class TrackingModule {}
