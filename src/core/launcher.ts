import { Bot } from './bot';
import { StartError } from './bot/errors';
import { LogEvent, LogLevel } from './bot/logger';

import chalk from 'chalk';
import moment from 'moment';

/**
 * Helper class that starts a bot instance as the main objective of the current process, which means:
 *
 * - The bot's log output will be forwarded directly to the console.
 * - Errors when starting the bot will stop the process with an error code.
 * - Exit signals will be caught and the bot will be stopped gracefully.
 */
export class BotLauncher {

	public constructor(public readonly bot: Bot, public readonly options: BotLauncherOptions = {}) {
		bot.logger.options.colors = true;
		bot.logger.on('log', event => this.writeLog(event));
	}

	public async start() {
		try {
			await this.bot.start();
		}
		catch (error) {
			if (error instanceof StartError) {
				console.error(chalk.red('Start error:'), error.message);
			}
			else {
				console.error(chalk.red('Unexpected error on start:'), error);
			}

			process.exit(1);
		}
	}

	protected writeLog(event: LogEvent) {
		if (event.level >= (this.options.loggingLevel ?? 1)) {
			const text = this.getLogPrefix(event) + event.content;

			if (event.level >= 2) {
				console.error(text);
			}
			else {
				console.log(text);
			}
		}
	}

	protected getLogPrefix(event: LogEvent) {
		const time = moment(event.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS');
		const timestamp = chalk.gray(`[${time}]`);
		const name = chalk.gray(`[${event.name}]`);

		let level = '';

		switch (event.level) {
			case LogLevel.Verbose2: level = chalk.greenBright.italic('verbose:'); break;
			case LogLevel.Verbose: level = chalk.greenBright('verbose:'); break;
			case LogLevel.Debug: level = chalk.magenta('debug:'); break;
			case LogLevel.Info: level = chalk.cyanBright('info:'); break;
			case LogLevel.Warn: level = chalk.yellowBright('warn:'); break;
			case LogLevel.Error: level = chalk.red('error:'); break;
		}

		return `${timestamp} ${name} ${level} `;
	}

}

export interface BotLauncherOptions {
	loggingLevel?: LogLevel;
}
