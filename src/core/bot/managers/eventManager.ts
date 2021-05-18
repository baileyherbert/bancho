import { Bot } from 'bancho/bot';
import { PromiseCompletionSource } from 'bancho/utilities/promises';
import { Closure } from 'bancho/utilities/types';
import { Logger } from '../logger';

export class EventManager {

	private _bot: Bot;
	private _handlers: Map<string, Set<Closure>>;
	private _logger: Logger;
	private _queue: Set<QueuedEvent>;

	public constructor(bot: Bot) {
		this._bot = bot;
		this._handlers = new Map();
		this._logger = bot.logger.createLogger('events');
		this._queue = new Set();
	}

	/**
	 * Registers an event handler.
	 *
	 * @param event
	 * @param closure
	 */
	public register(event: string, closure: Closure) {
		if (!this._handlers.has(event)) {
			this._handlers.set(event, new Set());
		}

		this._handlers.get(event)?.add(closure);
	}

	/**
	 * Removes an event handler.
	 *
	 * @param event
	 * @param closure
	 */
	public deregister(event: string, closure: Closure) {
		this._handlers.get(event)?.delete(closure);
	}

	/**
	 * Clears event handlers.
	 *
	 * If an event is provided, only handlers for that event will be cleared. Otherwise, all handlers will be cleared.
	 *
	 * @param event
	 */
	public clear(event?: string) {
		if (event !== undefined) {
			this._handlers.delete(event);
		}
		else {
			this._handlers.clear();
		}
	}

	/**
	 * Invokes an event on the manager. Returns a promise which resolves after all handlers have finished invoking.
	 *
	 * Errors in handlers will be caught and the returned promise will never reject.
	 *
	 * @param event
	 * @param args
	 */
	public async invoke(event: string, ...args: any[]) {
		if (typeof event !== 'string') {
			throw new Error(`Invalid event type (expected string, got ${typeof event})`);
		}

		// Queue events if the bot isn't online
		if (this._bot.status !== 'online' && this._bot.status !== 'stopping') {
			const source = new PromiseCompletionSource<void>();

			this._queue.add({
				name: event,
				arguments: args,
				source
			});

			return source.promise;
		}

		const promises = new Array<Promise<void>>();

		if (this._handlers.has(event)) {
			for (const handler of this._handlers.get(event)!) {
				try {
					const res = Promise.resolve(handler(...args));

					promises.push(new Promise<void>(resolve => {
						res.then(resolve, err => {
							this._logger.error('Uncaught error in %s event handler:', event, err);
							resolve();
						});
					}));
				}
				catch (err) {
					this._logger.error('Uncaught error in %s event handler:', event, err);
				}
			}
		}

		await Promise.all(promises);
	}

	/**
	 * dispatches qeuued events.
	 */
	public flush() {
		if (this._bot.status === 'online' || this._bot.status === 'stopping') {
			for (const event of this._queue) {
				this.invoke(event.name, ...event.arguments)
					.then(() => event.source.setResult());
			}
		}
	}

}

interface QueuedEvent {
	name: string;
	arguments: any[];
	source: PromiseCompletionSource<void>;
}
