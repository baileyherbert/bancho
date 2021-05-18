import { Client, CommandInteraction, Intents, Interaction } from 'discord.js';
import { dirname } from 'path';
import { ModuleOptions } from './architecture/module';
import { Bridge } from './bot/bridge';
import { Configuration } from './bot/data/config';
import { Store } from './bot/data/store';
import { InvalidArgumentError, StartError, UserError } from './bot/errors';
import { CommandEvent } from './bot/events/commandEvent';
import { Logger } from './bot/logger';
import { CommandManager } from './bot/managers/commandManager';
import { EventManager } from './bot/managers/eventManager';
import { TaskManager } from './bot/managers/taskManager';
import { BotModule } from './bot/structures/botModule';
import { Container } from './container';
import { PromiseCompletionSource, PromiseTimeoutSource } from './utilities/promises';
import { ReflectionClass } from './utilities/reflection/reflection.class';
import { Type } from './utilities/types';

export class Bot {

	public client: Client;
	public logger: Logger;

	public container: Container;
	public modules: BotModule[];
	public options: BotOptions;

	public commands: CommandManager;
	public tasks: TaskManager;
	public events: EventManager;

	private _config: Configuration<BotConfig>;

	private _configurations = new Map<string, Configuration<any>>();
	private _stores = new Map<string, Store<any>>();
	private _storeLoaders = new Map<string, Promise<Store<any>>>();

	private _status: Status = 'offline';

	/**
	 * The current status of the bot.
	 */
	public get status() {
		return this._status;
	}

	public constructor(options: BotConstructorOptions) {
		this.logger = new Logger('bot');

		this.options = {
			token: options.token,
			configPath: options.configPath ?? 'config',
			storagePath: options.storagePath ?? 'storage',
			modules: options.modules
		};

		this._config = this.createConfig<BotConfig>('bot', {
			token: 'DISCORD_TOKEN'
		});

		this.client = new Client({
			intents: [
				Intents.FLAGS.GUILDS,
				Intents.FLAGS.GUILD_MEMBERS,
				Intents.FLAGS.GUILD_MESSAGES,
				Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
				Intents.FLAGS.GUILD_MESSAGE_TYPING,
				Intents.FLAGS.GUILD_PRESENCES,
				Intents.FLAGS.GUILD_VOICE_STATES
			]
		});

		this.logger.history = 250;

		this.container = new Container();
		this.container.register(this);

		this.modules = this._initModules();

		this.commands = new CommandManager(this);
		this.tasks = new TaskManager(this);
		this.events = new EventManager(this);

		Bridge.bot = this;
	}

	/**
	 * Starts the bot.
	 */
	public async start() {
		this.logger.info('Starting the bot...');
		this._status = 'starting';

		// Prepare the client
		this.client.removeAllListeners();
		this.client.on('interaction', interaction => this._onInteraction(interaction));

		// Log into the client
		await Promise.all([
			this.client.login(this.options.token ?? this._getToken()),
			new Promise<void>(resolve => this.client.once('ready', resolve))
		]);

		this.logger.debug('Authenticated as client:', this.client.user?.id);
		this.logger.debug('Logged in as:', this.client.user?.tag);
		this.logger.debug(
			'Discovered %d guild%s',
			this.client.guilds.cache.size,
			this.client.guilds.cache.size !== 1 ? 's' : ''
		);

		this.logger.info('Starting modules...');

		// Start modules
		for (const module of this.modules) {
			this.logger.debug('Starting module: %s', module.options.name);

			// Start services under the module
			// This method returns true for success
			if (!await module.start()) {
				throw new StartError(`The ${module.options.name} module returned an error during start`);
			}

			// Register commands in the manager
			for (const controller of module.getControllers()) {
				this.commands.register(controller);
			}
		}

		// Send new or modified commands to Discord
		await this.commands.sync();
		this.logger.info('Bot started successfully');

		// Start tasks
		this.tasks.start();

		// Update state and dispatch pending events
		this._status = 'online';
		this.events.flush();
	}

	/**
	 * Stops the bot.
	 */
	public async stop() {
		this.logger.info('Stopping the bot...');
		this._status = 'stopping';
		this.client.destroy();

		for (const module of this.modules) {
			if (module.active) {
				this.logger.info('Stopping module: %s', module.options.name);

				// Stop the services
				// This will catch errors and isolate them automatically
				await module.stop();

				// Delete commands from the manager
				for (const controller of module.getControllers()) {
					this.commands.deregister(controller);
				}
			}
		}

		this._status = 'offline';
	}

	/**
	 * Registers module objects in the container and returns an array of `BotModule` instances to help work with them.
	 */
	private _initModules() {
		const modules = [];

		for (const module of this.options.modules) {
			const ref = new ReflectionClass(module);
			const options = ref.getMetadata<ModuleOptions>('bancho:module');

			if (options !== undefined) {
				// Create the internal module instances
				modules.push(new BotModule(this, options));
			}
		}

		return modules;
	}

	/**
	 * Handles a new interaction.
	 *
	 * @param interaction
	 * @returns
	 */
	private async _onInteraction(interaction: Interaction) {
		if (!interaction.isCommand()) return;

		// Retrieve the command instance
		const command = this.commands.getCommand(interaction.commandName);

		// Send an error if the command wasn't found
		// This should never happen but you never know!
		if (command === undefined) {
			this.logger.warn('An unknown command named "%s" was invoked as a slash command', interaction.commandName);
			return interaction.reply(`🛑  Hmm, strange. I couldn't find that command.`);
		}

		// Create the event
		const event = new CommandEvent(interaction, command);
		const usage = this._getCommandUsage(interaction);

		// Build a timeout that will defer the interaction after a short period of inactivity
		const timeout = new PromiseTimeoutSource(500, () => {
			if (!interaction.deferred) {
				this.logger.debug('Deferring interaction due to timeout: /%s', usage);
				event.defer(command.options.hidden ?? false);
			}
		});

		// Log the command
		this.logger.info(
			'Invocation from %s in %s: /%s',
			interaction.user.tag,
			event.isGuild ? event.guild.name : 'DM',
			usage
		);

		// Invoke the method
		try {
			await Promise.resolve(command.callback(event));
			timeout.cancel();
		}
		catch (err) {
			timeout.cancel();

			if (err instanceof InvalidArgumentError || err instanceof UserError) {
				this.logger.error('Failed to complete %s interaction:', interaction.commandName, err.message);

				// @ts-ignore
				event.send('⛔  **Error:** ' + err.message, { ephemeral: true }).catch(err => {});
			}
			else {
				this.logger.error('Failed to complete %s interaction:', interaction.commandName, err);

				// @ts-ignore
				event.send('⛔  **Error:** Something went wrong!', { ephemeral: true }).catch(err => {});
			}
		}
	}

	/**
	 * Returns a string representing what a slash command looked like on the user interface.
	 *
	 * @param interaction
	 * @returns
	 */
	private _getCommandUsage(interaction: CommandInteraction) {
		let commandName = interaction.commandName;
		let options = interaction.options;

		// Append the subcommand if this is a group
		if (interaction.options.length === 1 && interaction.options[0].type === 'SUB_COMMAND') {
			commandName += ' ' + interaction.options[0].name;
			options = interaction.options[0].options ?? [];
		}

		// Append arguments
		return commandName + ' ' + options.map(opt => {
			let value = opt.value;

			if (typeof value === 'string') {
				if (value.length > 128) {
					value = value.substring(0, 125) + '...';
				}
			}

			return value;
		}).join(' ').trim();
	}

	/**
	 * Loads the bot's token from the `config/token.json` file.
	 *
	 * @returns
	 */
	private _getToken() {
		if (this._config.value.token === 'DISCORD_TOKEN') {
			// Get services
			// This will trigger service construction which will create their configuration files
			for (const module of this.modules) {
				module.getServices();
			}

			// Now prompt the user to edit all files in the config directory
			throw new StartError(
				'Configuration files have been generated at: ' + dirname(this._config.path) + '\n' +
				'Please edit them and then start the bot again.'
			);
		}

		return this._config.value.token;
	}

	/**
	 * Returns a `Configuration` instance with the given name and default value. If a generic type is not provided,
	 * the type is inferred from the default value.
	 */
	public createConfig<T>(name: string, defaults: T): Configuration<T> {
		if (this._configurations.has(name)) {
			return this._configurations.get(name)!;
		}

		const config = new Configuration<T>(
			this,
			this.options.configPath,
			name,
			defaults
		);

		this.logger.verbose('Created configuration store:', config.path);

		this._configurations.set(name, config);
		return config;
	}

	/**
	 * Returns a `Store` instance with the given name.
	 *
	 * **Warning:** This method is synchronous and will block the thread until it finishes loading from disk. Therefore,
	 * you should only use this method from service class constructors.
	 *
	 * To create a store asynchronously, use `getStoreAsync()`.
	 */
	public createStore<T>(name: string, defaults: T): Store<T> {
		if (this._stores.has(name)) {
			return this._stores.get(name)!;
		}

		const store = new Store<T>(this, this.options.storagePath, name, defaults);
		this._stores.set(name, store);

		this.logger.verbose('Created data store:', store.path);

		return store;
	}

	/**
	 * Returns a `Store` instance with the given name.
	 *
	 * @param name
	 * @param defaults
	 * @returns
	 */
	public async createStoreAsync<T>(name: string, defaults: T): Promise<Store<T>> {
		if (this._stores.has(name)) {
			return this._stores.get(name)!;
		}

		if (this._storeLoaders.has(name)) {
			return this._storeLoaders.get(name)!;
		}

		const source = new PromiseCompletionSource<Store<T>>();
		this._storeLoaders.set(name, source.promise);

		const store = await Store.createAsync(this, this.options.storagePath, name, defaults);
		this._stores.set(name, store);

		source.setResult(store);
		this._storeLoaders.delete(name);

		this.logger.verbose('Created data store:', store.path);

		return store;
	}

	/**
	 * Returns all guilds that the bot is a member of.
	 *
	 * @returns
	 */
	public getGuilds() {
		return [...this.client.guilds.cache.values()];
	}

	/**
	 * Returns all users that the bot can see.
	 *
	 * @returns
	 */
	public getUsers() {
		return [...this.client.users.cache.values()];
	}

}

export interface BotConstructorOptions {
	/**
	 * The token to use for authentication. If not provided, it will be loaded automatically from the `config/bot.json`
	 * configuration file.
	 */
	token?: string;

	/**
	 * Path to the directory to use for storing this bot's configuration files. Defaults to `config` in the current
	 * working directory.
	 */
	configPath?: string;

	/**
	 * Path to the directory to use for storing data from this bot's services. Defaults to `storage` in th e current
	 * working directory.
	 */
	storagePath?: string;

	/**
	 * An array of modules to use for this bot.
	 */
	modules: Type<any>[];
}

interface BotOptions {
	token?: string;
	configPath: string;
	storagePath: string;
	modules: Type<any>[];
}

interface BotConfig {
	token: string;
}

type Status = 'online' | 'starting' | 'stopping' | 'offline';
