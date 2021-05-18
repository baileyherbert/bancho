import { ArgumentType, Command, CommandEvent, Controller, Group, LogEvent, LogLevel } from 'bancho';
import moment from 'moment';

export class BotUtilitiesController extends Controller {

	@Command({
		name: 'logs',
		description: 'Sends a snippet of internal logs to the chat.',
		arguments: [
			{
				name: 'level',
				description: 'The verbosity of the output to receive. [default: info]',
				type: ArgumentType.String,
				choices: [
					{ name: 'verbose', value: 'verbose' },
					{ name: 'debug', value: 'debug' },
					{ name: 'info', value: 'info' },
					{ name: 'warn', value: 'warn' },
					{ name: 'error', value: 'error' }
				]
			},
			{
				name: 'size',
				description: 'The number of lines to show, between 10 and 250. [default: 30]',
				type: ArgumentType.Integer
			}
		]
	})
	public async onLogs(event: CommandEvent) {
		const level = this._getLogLevel(event.getArgument('level'));
		const size = event.getArgument<number>('size') ?? 30;

		await event.defer();

		const [log, length] = this._getLogBuffer(level, size);

		if (length > 0) {
			event.send(`Attaching the last ${length} output line${length !== 1 ? 's' : ''} below:`);

			await event.channel.send({
				files: [
					{
						name: 'bancho.log',
						attachment: log
					}
				]
			});
		}
		else {
			event.send(`I don't have any recent output at that verbosity.`);
		}
	}

	private _getLogBuffer(level: LogLevel, size: number): [Buffer, number] {
		const lines = [];

		for (const event of this.bot.logger.getHistory(size)) {
			if (event.level >= level) {
				lines.push(this.getLogPrefix(event) + event.content);
			}
		}

		const output = lines.join('\n');
		return [Buffer.from(output, 'utf8'), lines.length];
	}

	protected getLogPrefix(event: LogEvent) {
		const time = moment(event.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS');
		const timestamp = `[${time}]`;
		const name = `[${event.name}]`;

		let level = '';

		switch (event.level) {
			case LogLevel.Verbose: level = 'verbose:'; break;
			case LogLevel.Debug: level = 'debug:'; break;
			case LogLevel.Info: level = 'info:'; break;
			case LogLevel.Warn: level = 'warn:'; break;
			case LogLevel.Error: level = 'error:'; break;
		}

		return `${timestamp} ${name} ${level} `;
	}

	/**
	 * Converts a string into a log level.
	 *
	 * @param input
	 * @returns
	 */
	private _getLogLevel(input?: string) {
		switch (input) {
			case 'verbose': return LogLevel.Verbose;
			case 'debug': return LogLevel.Debug;
			case 'info': return LogLevel.Info;
			case 'warn': return LogLevel.Warn;
			case 'error': return LogLevel.Error;
		}

		return LogLevel.Info;
	}

}
