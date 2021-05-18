import { Bot } from 'bancho/bot';

export interface TaskEvent {

	bot: Bot;

	/**
	 * When `true`, this task is being executed immediately rather than at its scheduled time. You can use the
	 * `isImmediateLate` and `isImmediateBoot` properties to determine why the task is being executed in this manner.
	 */
	isImmediate: boolean;

	/**
	 * When `true`, this task is being executed immediately because it missed its scheduled invocation time.
	 */
	isImmediateLate: boolean;

	/**
	 * When `true`, this task is being executed immediately because it is configured to run on boot.
	 */
	isImmediateBoot: boolean;

	/**
	 * When `true`, this task is being executed for the first time.
	 */
	isFirstRun: boolean;

	/**
	 * Whether or not this invocation is a reattempt because the previous invocation threw an error.
	 */
	isReattempt: boolean;

	/**
	 * The timestamp at which this task was scheduled to run. If the task is being reattempted or is late, this will
	 * still contain the original scheduled time.
	 */
	currentInvokeTime: number;

	/**
	 * The timestamp at which this task is next scheduled to run.
	 */
	nextInvokeTime: number;

	/**
	 * The timestamp at which this task was last invoked (not including the current invocation) or `undefined` if it
	 * has never run before.
	 */
	lastInvokeTime?: number;

}
