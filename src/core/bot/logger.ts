import { EventEmitter } from '../utilities/events';
import util from 'util';

export class Logger extends EventEmitter<Events> {

	/**
	 * The options to use when formatting log output.
	 */
	public options: util.InspectOptions = {};

	/**
	 * The number of output lines to record, including from child loggers.
	 */
	public history = 0;

	private _history = new Array<LogEvent>();

	public constructor(protected name: string, protected parent?: Logger) {
		super();

		// Inherit from the parent if applicable
		if (parent !== undefined) {
			this.options = parent.options;
			this.on('log', event => parent._emit('log', event));
		}

		this.on('log', event => {
			if (this.history > 0) {
				this._history.push(event);

				while (this._history.length > this.history) {
					this._history.shift();
				}
			}
		});
	}

	/**
	 * Returns log history. The items at the beginning of the array are the oldest.
	 *
	 * @returns
	 */
	public getHistory(size?: number) {
		const length = Math.min(this._history.length, Math.max(10, size ?? this.history));
		const offset = this._history.length - length;

		return this._history.slice(offset);
	}

	/**
	 * Creates a new child `Logger` instance that inherits options from and forwards events up to this logger.
	 *
	 * @param name
	 * @returns
	 */
	public createLogger(name: string) {
		return new Logger(name, this);
	}

	public verbose2(...args: any[]) {
		return this.writeLine(LogLevel.Verbose2, ...args);
	}

	public verbose(...args: any[]) {
		return this.writeLine(LogLevel.Verbose, ...args);
	}

	public debug(...args: any[]) {
		return this.writeLine(LogLevel.Debug, ...args);
	}

	public info(...args: any[]) {
		return this.writeLine(LogLevel.Info, ...args);
	}

	public warn(...args: any[]) {
		return this.writeLine(LogLevel.Warn, ...args);
	}

	public error(...args: any[]) {
		return this.writeLine(LogLevel.Error, ...args);
	}

	protected writeLine(level: LogLevel, ...args: any[]) {
		this._emit('log', {
			level,
			name: this.name,
			timestamp: Date.now(),
			content: util.formatWithOptions(this.options, ...args)
		});
	}

}

type Events = {
	log: [event: LogEvent];
};

export enum LogLevel {
	Verbose2,
	Verbose,
	Debug,
	Info,
	Warn,
	Error
}

export interface LogEvent {
	/**
	 * The level of this log entry.
	 */
	level: LogLevel;

	/**
	 * The name of the logger which sent this event. This can be used to discern which part of the code base a log
	 * entry originated from.
	 */
	name: string;

	/**
	 * The original timestamp at which this log event was dispatched.
	 */
	timestamp: number;

	/**
	 * The text content of the log event.
	 */
	content: string;
}
