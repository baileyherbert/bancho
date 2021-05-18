import { Bot } from 'bancho/bot';
import { Bridge } from 'bancho/bot/bridge';
import { Store } from 'bancho/bot/data/store';
import { Logger } from 'bancho/bot/logger';
import { BotModule } from 'bancho/bot/structures/botModule';

export class Controller {

	protected bot: Bot;
	public readonly logger: Logger;

	/**
	 * The module this controller was loaded from.
	 */
	public readonly module: BotModule;

	public constructor() {
		this.module = Bridge.module;
		this.bot = Bridge.container.singleton(Bot);
		this.logger = this.bot.logger.createLogger('controller:' + this.name);
	}

	/**
	 * Returns the name of the service based on the class name, but without the 'service' at the end. The returned name
	 * is in full lowercase.
	 *
	 * @returns
	 */
	public get name() {
		return this.constructor.name.toLowerCase().replace(/controller$/, '');
	}

	/**
	 * Returns a `Store` instance for this service with the specified name and default value. If a generic type is not
	 * provided, the type is inferred from the default value.
	 *
	 * @param name
	 * @param defaults
	 * @returns
	 */
	protected getStore<T>(name: string): Store<T | undefined>;
	protected getStore<T>(name: string, defaults: T): Store<T>;
	protected getStore<T>(name: string, defaults?: T) {
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
	protected getStoreAsync<T>(name: string): Promise<Store<T | undefined>>;
	protected getStoreAsync<T>(name: string, defaults: T): Promise<Store<T>>;
	protected getStoreAsync<T>(name: string, defaults?: T) {
		return this.bot.createStoreAsync(
			`modules/${this.module.options.name}/${name}`,
			defaults
		);
	}

}
