import { CommandOptions } from 'bancho/architecture/decorators/controller.decorators';
import { MethodFilter, ReflectionClass } from 'bancho/utilities/reflection/reflection.class';
import { Controller } from '../../architecture/controller';
import { ModuleOptions } from '../../architecture/module';
import { Service } from '../../architecture/service';
import { Bot } from '../../bot';
import { Closure, Type } from '../../utilities/types';
import { Bridge } from '../bridge';
import { Logger } from '../logger';
import { BotCommand } from './botCommand';
import { BotCommandGroup } from './botCommandGroup';

export class BotModule {

	private _controllers = new Map<Type<Controller>, Controller>();
	private _services = new Map<Type<Service>, Service>();
	private _commands = new Set<BotCommand>();

	private _discordEvents = new Map<string, Closure[]>();
	private _serviceEvents = new Map<string, Closure[]>();

	public logger: Logger;
	public active = false;

	public constructor(public bot: Bot, public options: ModuleOptions) {
		this.logger = bot.logger.createLogger('module:' + this.options.name);
	}

	/**
	 * Starts the module's services.
	 */
	public async start() {
		this.active = true;

		for (const service of this.getServices()) {
			try {
				// @ts-ignore
				await service._start();

				// Apply event handlers
				const ref = new ReflectionClass(service);
				this._initDiscordEvents(service, ref);
				this._initServiceEvents(service, ref);
			}
			catch (error) {
				this.logger.error('Failed to start the %s service:', service.name, error);
				return false;
			}
		}

		for (const controller of this.getControllers()) {
			const ref = new ReflectionClass(controller);
			this._initDiscordEvents(controller, ref);
			this._initServiceEvents(controller, ref);
		}

		return true;
	}

	/**
	 * Stops the module's services.
	 */
	public async stop() {
		this.active = false;

		// Remove discord event handlers
		for (const [event, handlers] of this._discordEvents) {
			for (const handler of handlers) {
				this.bot.client.removeListener(event, handler);
			}
		}

		// Remove service event handlers
		for (const [event, handlers] of this._serviceEvents) {
			for (const handler of handlers) {
				this.bot.events.deregister(event, handler);
			}
		}

		// Clear internal data
		this._serviceEvents.clear();
		this._discordEvents.clear();

		// Stop services in the module
		for (const service of this.getServices()) {
			if (service.active) {
				try {
					// @ts-ignore
					await service._stop();
				}
				catch (error) {
					this.logger.error('Failed to stop the %s service:', service.name, error);
				}
			}
		}
	}

	/**
	 * Returns an array of controller instances under this module.
	 *
	 * @returns
	 */
	public getControllers() {
		for (const constructor of this.options.controllers ?? []) {
			if (!this._controllers.has(constructor)) {
				Bridge.module = this;
				this._controllers.set(constructor, this.bot.container.singleton(constructor));
			}
		}

		return [...this._controllers.values()];
	}

	/**
	 * Returns an array of service instances under this module.
	 *
	 * @returns
	 */
	public getServices() {
		for (const constructor of this.options.services ?? []) {
			if (!this._services.has(constructor)) {
				Bridge.module = this;
				this._services.set(constructor, this.bot.container.singleton(constructor));
			}
		}

		return [...this._services.values()];
	}

	/**
	 * Loads discord events from metadata and applies them to the client.
	 *
	 * @param service
	 * @param ref
	 */
	private _initDiscordEvents(service: Service | Controller, ref: ReflectionClass<Service | Controller>) {
		const methods = ref.getMethods().filter(method => method.hasMetadata('bancho:handler:discord'));

		for (const method of methods) {
			const eventName = method.getMetadata<string>('bancho:handler:discord')!;
			const closure = method.getClosure(service);

			const handler = async (...args: any[]) => {
				try {
					await Promise.resolve(closure(...args));
				}
				catch (error) {
					// @ts-ignore
					service.logger.error('Error in %s event handler:', eventName, error);
				}
			};

			if (!this._discordEvents.has(eventName)) {
				this._discordEvents.set(eventName, []);
			}

			this.bot.client.on(eventName, handler);
			this._discordEvents.get(eventName)?.push(handler);
		}
	}

	/**
	 * Loads service events from metadata and applies them to the bot's event manager.
	 *
	 * @param service
	 * @param ref
	 */
	private _initServiceEvents(service: Service | Controller, ref: ReflectionClass<Service | Controller>) {
		const methods = ref.getMethods().filter(method => method.hasMetadata('bancho:handler:service'));

		for (const method of methods) {
			const eventName = method.getMetadata<string>('bancho:handler:service')!;
			const closure = method.getClosure(service);

			const handler = async (...args: any[]) => {
				try {
					await Promise.resolve(closure(...args));
				}
				catch (error) {
					// @ts-ignore
					service.logger.error('Error in %s event handler:', eventName, error);
				}
			};

			if (!this._serviceEvents.has(eventName)) {
				this._serviceEvents.set(eventName, []);
			}

			this.bot.events.register(eventName, handler);
			this._serviceEvents.get(eventName)?.push(handler);
		}
	}

}
