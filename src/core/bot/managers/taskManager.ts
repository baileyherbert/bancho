import { Service } from 'bancho/architecture/service';
import { Bot } from 'bancho/bot';
import { Store } from '../data/store';
import { CronJob } from 'cron';
import { TaskEvent } from '../events/taskEvent';
import { PromiseCompletionSource, PromiseTimeoutSource } from 'bancho/utilities/promises';
import { ReflectionClass } from 'bancho/utilities/reflection/reflection.class';
import { TaskOptions } from 'bancho/architecture/decorators/service.decorators';
import { FetchError } from 'node-fetch';
import { Logger } from '../logger';
import { TaskError } from '../errors';

export class TaskManager {

	private _store: Store<TaskData[]>;
	private _tasks = new Set<Task>();
	private _running = new Map<Task, Promise<void>>();
	private _reattemptTimeouts = new Set<PromiseTimeoutSource>();
	private _bot: Bot;
	private _logger: Logger;

	public constructor(bot: Bot) {
		this._store = bot.createStore('bancho/tasks', []);
		this._bot = bot;
		this._logger = bot.logger.createLogger('tasks');
	}

	/**
	 * Registers tasks for the given service.
	 *
	 * @param service
	 */
	public register(service: Service) {
		const ref = new ReflectionClass(service);
		const methods = ref.getMethods().filter(method => method.hasMetadata('bancho:task'));

		for (const method of methods) {
			const options = method.getMetadata<TaskOptions>('bancho:task')!;

			// Retrieve the task data object
			const data = this._getTaskDataFromStore({
				serviceId: service.id,
				taskName: method.name,
				taskSchedule: options.schedule,
				timeLastRun: 0,
				timeNextRun: 0,
				totalRuns: 0
			});

			// Check for schedule changes
			if (data.taskSchedule !== options.schedule) {
				data.timeNextRun = 0;
				data.taskSchedule = options.schedule;
			}

			// @ts-ignore
			const task: Task = {
				name: method.name,
				callback: method.getClosure(service),
				data,
				service,
				options
			};

			// Create the cron job
			task.job = new CronJob(
				options.schedule,
				() => this._invokeTask(task),
				null,
				false,
				options.timezone ?? service.timezone
			);

			// Add the task
			this._tasks.add(task);
		}
	}

	/**
	 * Deregisters and stops tasks from the given service.
	 *
	 * @param service
	 */
	public deregister(service: Service) {
		for (const task of this._tasks) {
			if (task.service === service) {
				task.job.stop();
				this._tasks.delete(task);
			}
		}
	}

	/**
	 * Starts running tasks.
	 */
	public start() {
		// Clean up old data
		for (const taskData of this._store.value) {
			const task = [...this._tasks].find(t => t.name === taskData.taskName && t.service.id === taskData.serviceId);

			if (!task) {
				this._store.value = this._store.value.filter(t => t !== taskData);
				this._store.save();
			}
		}

		// Iterate over tasks and start them
		for (const task of this._tasks) {
			// Set the initial next run time if needed
			if (task.data.timeNextRun === 0) {
				task.data.timeNextRun = task.job.nextDate().valueOf();
			}

			// Schedule tasks that are failing
			if (task.data.timeNextReattempt) {
				this._scheduleReattempt(task);
				continue;
			}

			// Check if we need to run immediately
			const isLate = (task.options.immediateWhenLate ?? false) && task.data.timeNextRun > 0 && task.data.timeNextRun <= Date.now();
			const isFirstRun = (task.options.immediateFirstRun ?? false) && task.data.totalRuns === 0;
			const isBoot = (task.options.immediate ?? false);

			// Next run time
			const nextInvokeTime = task.job.nextDate().valueOf();

			// Invoke the task immediately if applicable
			if (isLate || isFirstRun || isBoot) {
				this._invokeTask(task, {
					bot: this._bot,
					isFirstRun: task.data.totalRuns === 0,
					isImmediate: true,
					isImmediateLate: isLate,
					isImmediateBoot: isBoot,
					isReattempt: false,
					currentInvokeTime: task.data.timeNextRun,
					nextInvokeTime,
					lastInvokeTime: task.data.timeLastRun > 0 ? task.data.timeLastRun : undefined
				});
			}

			// Start the job
			task.data.timeNextRun = nextInvokeTime;
			task.job.start();
			this._store.save();
		}
	}

	/**
	 * Invokes a task with its timeout and catches any errors.
	 *
	 * @param decoration
	 * @param task
	 * @param event
	 */
	private async _invokeTask(task: Task, event?: TaskEvent): Promise<void> {
		// Do nothing if the task is running
		if (this._running.has(task)) {
			this._logger.verbose('Skipped task <%s> because it was already running', task.name);
			return;
		}

		const source = new PromiseCompletionSource<void>();
		this._running.set(task, source.promise);

		// Get data
		const currentInvokeTime = task.data.timeNextRun;
		const nextInvokeTime = task.job.nextDate().valueOf();
		const lastInvokeTime = task.data.timeLastRun > 0 ? task.data.timeLastRun : undefined;
		const attemptNumber = task.data.numFailures ?? 0;

		// Build the event object if one wasn't provided
		event = event ?? {
			bot: this._bot,
			isFirstRun: task.data.totalRuns === 0,
			isImmediate: false,
			isImmediateLate: false,
			isImmediateBoot: false,
			isReattempt: attemptNumber > 0,
			currentInvokeTime,
			nextInvokeTime,
			lastInvokeTime,
		};

		this._logger.verbose2('Starting task <%s:%s>', task.service.name, task.name);

		// Print a notice when we're reattempting
		if (attemptNumber > 0) {
			task.service.logger.warn('Retrying task %s (attempt #%d)...', task.name, attemptNumber);
		}

		// Build the timeout
		const timeout = this._createTimeout(task.options);

		try {
			// Track task times
			const startTime = Date.now();

			// Invoke the task
			await Promise.race([
				Promise.resolve(task.callback(event)),
				timeout?.promise
			]);

			const took = Date.now() - startTime;

			// Log timeout incidents
			if (timeout?.triggered) {
				task.service.logger.warn(
					'Task %s timed out after %d milliseconds',
					task.name,
					timeout.milliseconds
				);
			}

			this._logger.verbose2('Finished task <%s:%s> in %d milliseconds', task.service.name, task.name, took);

			// Update task data
			task.data.timeLastRun = startTime;
			task.data.timeNextRun = task.job.nextDate().valueOf();
			task.data.totalRuns++;

			// Show a confirmation when the task succeeds after retrying
			if (attemptNumber > 0) {
				task.data.numFailures = undefined;
				task.data.timeNextReattempt = undefined;
				task.job.start();

				task.service.logger.info(
					'Task %s succeeded after %d reattempt%s',
					task.name,
					attemptNumber,
					attemptNumber !== 1 ? 's' : ''
				);
			}
		}
		catch (error) {
			// Print debugging information for task errors to verbose
			if (error instanceof TaskError) {
				task.service.logger.error('Task %s failed:', task.name, error.message);

				if (error.realError !== undefined) {
					task.service.logger.verbose('Task %s failed due to:', task.name, error.realError);
				}
			}

			// Show nicer messages for fetch errors (these are common)
			else if (error instanceof FetchError) {
				task.service.logger.error('Task %s failed:', task.name, error.message);
			}

			// Show the full error stack for other errors
			else {
				task.service.logger.error('Uncaught error when running task %s:', task.name, error);
			}

			const nextAttemptNumber = attemptNumber + 1;
			const maxAttempts = task.options.numReattempts ?? 1;

			this._running.delete(task);

			// Can we try again?
			if (nextAttemptNumber <= maxAttempts) {
				// Stop the cron job so it doesn't run while we're retrying
				task.job.stop();

				// Update the reattempt data
				task.data.numFailures = nextAttemptNumber;
				task.data.timeNextReattempt = this._getNextAttemptTime(task);
				this._store.save();

				// Schedule the reattempt
				this._scheduleReattempt(task);
			}

			// If we cannot retry, we'll forget about this run and restart the cron job
			else {
				task.service.logger.warn(
					'Task %s failed after %d reattempt%s (resuming regular schedule)',
					task.name,
					attemptNumber,
					attemptNumber !== 1 ? 's' : ''
				);

				// Remove the reattempt data
				task.data.timeNextRun = task.job.nextDate().valueOf();
				task.data.numFailures = undefined;
				task.data.timeNextReattempt = undefined;
				this._store.save();

				// Start the cron job again
				task.job.start();
			}
		}
		finally {
			this._running.delete(task);
			source.setResult();
			this._store.save();
		}
	}

	/**
	 * Internally schedules a task reattempt using a timeout.
	 *
	 * @param task
	 * @returns
	 */
	private _scheduleReattempt(task: Task) {
		const timeRemaining = Math.max(0, task.data.timeNextReattempt! - Date.now());

		this._logger.verbose('Scheduling reattempt on task <%s> in %d milliseconds', task.name, timeRemaining);

		if (timeRemaining <= 0) {
			this._invokeTask(task);
			return;
		}

		const timeout = new PromiseTimeoutSource(timeRemaining, async () => {
			await this._invokeTask(task);
			this._reattemptTimeouts.delete(timeout);
		});

		this._reattemptTimeouts.add(timeout);
	}

	/**
	 * Returns the timestamp to use for the next attempt on a given task.
	 *
	 * @param task
	 * @returns
	 */
	private _getNextAttemptTime(task: Task) {
		const reattempt = task.data.numFailures ?? 0;

		if (reattempt <= 3) return Date.now() + 15000;
		if (reattempt <= 7) return Date.now() + 30000;
		if (reattempt <= 15) return Date.now() + 45000;

		return Date.now() + 60000;
	}

	/**
	 * Creates the timeout for a task.
	 *
	 * @param options
	 * @returns
	 */
	private _createTimeout(options: TaskOptions): Timeout | undefined {
		const milliseconds = options.timeout ?? 120000;

		if (milliseconds <= 0) {
			return;
		}

		const timeout: any = {
			triggered: false,
			milliseconds,
			handle: null,
			promise: null
		};

		timeout.promise = new Promise<void>(resolve => {
			timeout.handle = setTimeout(() => {
				timeout.triggered = true;
				resolve();
			}, milliseconds);
		});

		return timeout;
	}

	/**
	 * Returns an existing `Task` instance from the store if available. Otherwise, adds the task to the store and
	 * returns it again.
	 *
	 * @param serviceId
	 * @param taskName
	 * @returns
	 */
	private _getTaskDataFromStore(task: TaskData) {
		const existing = this._store.value.find(
			t => t.serviceId === task.serviceId && t.taskName === task.taskName
		);

		if (existing) {
			return existing;
		}

		this._store.value.push(task);

		return task;
	}

	public getTask(service: Service, taskName: string) {

	}

}

export interface TaskData {
	serviceId: string;
	taskName: string;
	taskSchedule: string;
	timeNextRun: number;
	timeLastRun: number;
	totalRuns: number;
	numFailures?: number;
	timeNextReattempt?: number;
}

export interface Task {
	data: TaskData;
	name: string;
	options: TaskOptions;
	service: Service;
	job: CronJob;
	callback: (...args: any[]) => any;
}

interface Timeout {
	triggered: boolean;
	milliseconds: number;
	handle: NodeJS.Timeout;
	promise: Promise<void>;
}
