import { Key } from 'bancho/utilities/types';
import { ClientEvents } from 'discord.js';

/**
 * Declares a method as a scheduled task. The `schedule` is a string containing six numbers delimited by spaces:
 *
 * - Seconds: `0-59`
 * - Minutes: `0-59`
 * - Hours: `0-23`
 * - Day: `1-31`
 * - Month: `0-11` (Jan-Dec)
 * - Day of week: `0-6` (Sun-Sat)
 *
 * @param schedule
 * @param options
 * @returns
 */
export function Task(schedule: string, options?: BaseTaskOptions): ITaskDecorator;
export function Task(options: TaskOptions): ITaskDecorator;
export function Task(a: any, b?: any): ITaskDecorator {
	return function (_target: any, _property: string, descriptor: TypedPropertyDescriptor<any>) {
		const schedule = typeof a === 'string' ? a : b.schedule;
		const options = typeof a === 'string' ? b : a;

		Reflect.defineMetadata('bancho:task', {
			schedule,
			...options
		}, descriptor.value);
	}
}

/**
 * Declares a method as a worker. These are asynchronous methods that operate in a loop with periods of inactivity
 * (delays or cooldowns) between tasks. When a worker needs to sleep for a certain amount of time, you must use the
 * appropriate method in order for the service to shut down properly:
 *
 * ```ts
 * await this.sleep(2000);
 * ```
 *
 * @returns
 */
export function Worker() {
	return function (_target: any, _property: string, descriptor: TypedPropertyDescriptor<any>) {
		Reflect.defineMetadata('bancho:worker', true, descriptor.value);
	}
}

export interface BaseTaskOptions {
	/**
	 * The timezone to use for the schedule.
	 */
	timezone?: string;

	/**
	 * When `true`, the task will be executed at startup. Defaults to `false`.
	 */
	immediate?: boolean;

	/**
	 * When `true`, the task will be executed at startup if the last scheduled time was missed. Defaults to `false`.
	 */
	immediateWhenLate?: boolean;

	/**
	 * When `true`, the task will be executed immediately if this is its first time running. Defaults to `false`.
	 */
	immediateFirstRun?: boolean;

	/**
	 * The number of milliseconds to wait for the task to complete before it is considered timed out.
	 *
	 * Tasks are not invoked if there is another instance of the task already running. This option will allow tasks
	 * to continue operating if there is a runaway or indefinite invocation.
	 *
	 * When the timeout is reached, a warning is printed to the log.
	 *
	 * Defaults to `120000`. Set to `0` to disable.
	 */
	timeout?: number;

	/**
	 * The maximum number of times the task should be reattempted if it fails. Reattempts grow increasingly delayed as
	 * their number increases. The task will not be invoked on its regular schedule while reattempting.
	 *
	 * Defaults to `1`.
	 */
	numReattempts?: number;
}

export interface TaskOptions extends BaseTaskOptions {
	/**
	 * The schedule of the task as a string containing six numbers delimited by spaces:
	 *
	 * - Seconds: `0-59`
	 * - Minutes: `0-59`
	 * - Hours: `0-23`
	 * - Day: `1-31`
	 * - Month: `0-11` (Jan-Dec)
	 * - Day of week: `0-6` (Sun-Sat)
	 */
	schedule: string;
}

type ITaskDecorator = (_target: any, _property: string, descriptor: TypedPropertyDescriptor<any>) => void;
