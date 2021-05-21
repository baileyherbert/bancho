import { Module } from 'bancho';
import { VoiceService } from './voice.service';

@Module({
	name: 'voice',
	services: [VoiceService]
})
export class VoiceModule {}
