import 'reflect-metadata';
import 'module-alias/register';
import 'source-map-support/register';

import path from 'path';

import { Bot } from './core/bot';
import { EthereumModule } from './modules/ethereum/ethereum.module';
import { BotLauncher } from './core/launcher';
import { LogLevel } from './core/bot/logger';
import { TrackingModule } from '@modules/tracking/tracking.module';
import { WeatherModule } from '@modules/weather/weather.module';
import { MusicModule } from '@modules/music/music.module';
import { UtilitiesModule } from '@modules/utilities/utilities.module';
import { WubbaModule } from '@modules/wubba/wubba.module';
import { GameModule } from '@modules/games/game.module';
import { SteamModule } from '@modules/steam/steam.module';
import { VoiceModule } from '@modules/voice/voice.module';

// Prevent running as root
if (typeof process.getuid === 'function' && process.getuid() === 0) {
	console.error('This application should not be run as root.');
	process.exit(1);
}

// Create the bot instance
const bancho = new Bot({
	configPath: path.resolve(__dirname, '../config'),
	storagePath: path.resolve(__dirname, '../storage'),
	modules: [
		EthereumModule,
		GameModule,
		MusicModule,
		SteamModule,
		TrackingModule,
		UtilitiesModule,
		WeatherModule,
		WubbaModule,
		VoiceModule
	]
});

// Use the default launcher to mount the bot to the current process
const launcher = new BotLauncher(bancho, {
	loggingLevel: LogLevel.Debug
});

launcher.start();
