import { Store } from 'bancho/bot/data/store';
import { BotModule } from 'bancho/bot/structures/botModule';
import { Bot } from '../bot';
import { Bridge } from '../bot/bridge';
import { Logger } from '../bot/logger';
import crypto from 'crypto';

export class Service {

	private _running = false;

	protected bot: Bot;

	/**
	 * The logger for this service.
	 */
	public logger: Logger;

	/**
	 * The module this service was loaded from.
	 */
	public readonly module: BotModule;

	/**
	 * The unique identifier for this service based on the module and service names.
	 */
	public readonly id: string;

	/**
	 * The default timezone to use for tasks in this service. When `undefined`, the default is set to UTC. Individual
	 * tasks can override this option.
	 *
	 * Note: At this time, this property must be set from within the constructor or `start()` methods to take effect.
	 */
	public timezone?: string;

	public constructor() {
		this.module = Bridge.module;
		this.bot = Bridge.container.singleton(Bot);
		this.logger = this.bot.logger.createLogger('service:' + this.name);

		const idTag = this.module.options.name + ':' + this.name;
		this.id = crypto.createHash('sha256').update(idTag).digest('hex').substring(0, 32);
	}

	/**
	 * Internally starts the service.
	 */
	private async _start() {
		this.logger.verbose('Service is starting');

		await this.start();

		this._running = true;
		this.bot.tasks.register(this);

		this.logger.verbose('Service started');
	}

	/**
	 * Internally stops the service.
	 */
	private async _stop() {
		this.logger.verbose('Service is stopping');

		this._running = false;
		this.bot.tasks.deregister(this);

		await this.stop();
		this.logger.verbose('Service stopped');
	}

	/**
	 * Invoked when the service is requested to start. Tasks and workers will be started automatically after this
	 * method completes successfully.
	 */
	protected start(): Promise<void> | void {

	}

	/**
	 * Invoked when the service is requested to stop. Tasks and workers will be stopped automatically before this
	 * method is invoked.
	 */
	protected stop(): Promise<void> | void {

	}

	/**
	 * Emits a service event. This event can be listened for and handled by other services and controllers throughout
	 * the bot.
	 *
	 * Returns a promise which resolves after all event handlers have returned.
	 *
	 * @param event
	 * @param args
	 */
	protected emit(event: string, ...args: any[]) {
		return this.bot.events.invoke(event, ...args);
	}

	/**
	 * Returns the name of the service based on the class name, but without the 'service' at the end. The returned name
	 * is in full lowercase.
	 *
	 * @returns
	 */
	public get name() {
		return this.constructor.name.toLowerCase().replace(/service$/, '');
	}

	/**
	 * Returns `true` if the service is currently active and running.
	 *
	 * @returns
	 */
	public get active() {
		return this._running;
	}

	/**
	 * Returns a `Configuration` instance for this service with the specified default value. If a generic type is not
	 * provided, the type is inferred from the default value.
	 *
	 * @param defaults
	 */
	protected createConfig<T>(defaults: T) {
		return this.bot.createConfig(
			`modules/${this.module.options.name}/${this.name}`,
			defaults
		);
	}

	/**
	 * Returns a `Store` instance for this service with the specified name and default value. If a generic type is not
	 * provided, the type is inferred from the default value.
	 *
	 * @param name
	 * @param defaults
	 * @returns
	 */
	protected createStore<T>(name: string): Store<T | undefined>;
	protected createStore<T>(name: string, defaults: T): Store<T>;
	protected createStore<T>(name: string, defaults?: T) {
		return this.bot.createStore(
			`modules/${this.module.options.name}/${name}`,
			defaults
		);
	}

	/**
	 * Returns a `Store` instance for this service with the specified name and default value. If a generic type is not
	 * provided, the type is inferred from the default value.
	 *
	 * @param name
	 * @param defaults
	 * @returns
	 */
	protected createStoreAsync<T>(name: string): Promise<Store<T | undefined>>;
	protected createStoreAsync<T>(name: string, defaults: T): Promise<Store<T>>;
	protected createStoreAsync<T>(name: string, defaults?: T) {
		return this.bot.createStoreAsync(
			`modules/${this.module.options.name}/${name}`,
			defaults
		);
	}

	/**
	 * Returns a promise which resolves after the specified number of milliseconds.
	 *
	 * If the service is asked to shut down during that time, the promise is rejected with an `AbortError`. This error
	 * is designed to be uncaught in order to cancel your current operation. The framework will eventually catch it
	 * and handle it silently.
	 *
	 * @param millis
	 */
	protected sleep(millis: number) {
		return new Promise(resolve => {
			setTimeout(resolve, millis);
		});
	}

}
