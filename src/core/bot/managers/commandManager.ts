import { Controller } from 'bancho/architecture/controller';
import { CommandOptions } from 'bancho/architecture/decorators/controller.decorators';
import { MethodFilter, ReflectionClass } from 'bancho/utilities/reflection/reflection.class';
import { ApplicationCommandData, ApplicationCommandManager, GuildApplicationCommandManager } from 'discord.js';
import { Bot } from '../../bot';
import { Logger } from '../logger';
import { BotCommand } from '../structures/botCommand';
import { BotCommandGroup } from '../structures/botCommandGroup';

export class CommandManager {

	private _commands = new Map<string, BotCommand>();
	private _groups = new Map<string, BotCommandGroup>();
	private _cache = new Map<Controller, Cache>();

	private _bot: Bot;
	private _logger: Logger;

	public constructor(bot: Bot) {
		this._bot = bot;
		this._logger = bot.logger.createLogger('commands');
	}

	/**
	 * Registers the given controller's commands in the manager.
	 *
	 * @param controller
	 */
	public register(controller: Controller) {
		const ref = new ReflectionClass(controller);
		const methods = ref.getMethods(MethodFilter.Local).filter(m => m.hasMetadata('bancho:command'));
		const groupName = ref.getMetadata<string>('bancho:group');

		// For commands that are not in a group, we can add them directly
		if (groupName === undefined) {
			const commands = [];

			for (const method of methods) {
				const options = method.getMetadata<CommandOptions>('bancho:command')!;
				const name = options.name.toLowerCase();
				const command = new BotCommand(this._bot, options, method.getClosure(controller));

				this._commands.set(name, command);
				commands.push(command);

				this._logger.verbose('Controller <%s> registered the <%s> command', controller.name, name);
			}

			this._cache.set(controller, commands);
		}

		// Groups require more work because we'll need to combine the commands into a single command
		// We'll use the `BotCommandGroup` helper to build a fake "monocommand" for this purpose
		else {
			// Get the group
			const group = this._groups.get(groupName) ?? new BotCommandGroup(groupName);

			// Register the controller
			group.register(controller, methods);

			// Save the group
			if (!this._groups.has(groupName)) {
				const command = new BotCommand(this._bot, group.options, group.closure);

				this._groups.set(groupName, group);
				this._commands.set(group.options.name.toLowerCase(), command);

				this._logger.verbose('Created a new command group named <%s>', groupName);
			}

			this._logger.verbose(
				'Controller <%s> added %d command%s to the <%s> group',
				controller.name,
				methods.length,
				methods.length !== 1 ? 's' : '',
				groupName
			);

			this._cache.set(controller, group);
		}
	}

	/**
	 * Removes a command from the manager.
	 *
	 * @param command
	 */
	public deregister(controller: Controller) {
		if (this._cache.has(controller)) {
			const cache = this._cache.get(controller)!;

			// Handle groups
			if (cache instanceof BotCommandGroup) {
				cache.deregister(controller);
			}

			// Deregister individual commands
			else {
				for (const command of cache) {
					this._commands.delete(command.options.name.toLowerCase());
				}
			}

			// Remove the cache entry
			this._cache.delete(controller);
		}
	}

	/**
	 * Returns the specified command or `undefined` if not found.
	 *
	 * @param name
	 * @returns
	 */
	public getCommand(name: string) {
		return this._commands.get(name.toLowerCase());
	}

	/**
	 * Compares local commands to commands registered on the client and uploads changes as necessary.
	 */
	public async sync() {
		let numModifications = 0;

		// Get data
		const guilds = this._bot.client.guilds.cache.array();
		const commandsGlobal = this.getGlobalCommands();
		const commandsGuild = this.getGuildCommands();

		// Upgrade guild commands
		this._bot.logger.info('Starting command synchronization');
		this._bot.logger.debug('Checking guild commands (count=%d)', commandsGuild.length);

		for (const guild of guilds) {
			numModifications += await this._upgradeRemoteCommands(guild.commands, commandsGuild);
		}

		// Upgrade global commands
		this._bot.logger.debug('Checking global commands (count=%d)', commandsGlobal.length);
		numModifications += await this._upgradeRemoteCommands(this._bot.client.application!.commands, commandsGlobal);

		// Print the number of changes
		if (numModifications === 0) this._bot.logger.info('Commands were up to date');
		else this._bot.logger.info('Commands updated (modifications=%d)', numModifications);
	}

	/**
	 * Upgrades commands on the remote command manager with the given local commands. Returns the number of changes
	 * that were made in total.
	 *
	 * @param manager
	 * @param commands
	 * @returns
	 */
	private async _upgradeRemoteCommands(manager: ApplicationCommandManager, commands: BotCommand[]) {
		const remote = (await manager.fetch()).array();
		const existing = new Map(remote.map(command => [command.name, command]));
		const target = manager instanceof GuildApplicationCommandManager ? ('guild: ' + manager.guild.name) : 'global';

		let numModifications = 0;

		// Delete commands from the remote that are no longer in the bot
		for (const [commandName, command] of existing) {
			if (!commands.find(c => c.options.name === commandName)) {
				this._logger.verbose('Remote command <%s> was not found in an active module', commandName);
				this._bot.logger.debug('Deleting %s command from %s', commandName, target);

				numModifications++;
				existing.delete(commandName);

				await command.delete();
			}
		}

		// Iterate over the commands in the bot and check for an equivalent remote command
		for (const command of commands) {
			const data = command.getData();
			const corresponding = existing.get(data.name);
			const outdated = !!corresponding && this._getCommandNeedsUpdating(data, corresponding);

			if (!corresponding) {
				this._logger.verbose('Local command <%s> was not found on the remote', data.name);
			}

			else if (outdated) {
				this._logger.verbose('Local command <%s> was different than the remote command', data.name);
			}

			else {
				this._logger.verbose('Local command <%s> matches the remote', data.name);
			}

			// Create the command if the corresponding command is undefined or doesn't match
			// After this is triggered once, it should trigger for all remaining commands to preserve order
			if (!corresponding || outdated) {
				this._bot.logger.debug('Creating %s command in %s', data.name, target);
				numModifications++;
				await manager.create(data);
			}
		}

		return numModifications;
	}

	/**
	 * Returns `true` if the given commands are different from one another.
	 *
	 * @param current
	 * @param previous
	 */
	private _getCommandNeedsUpdating(current: ApplicationCommandData, previous: ApplicationCommandData) {
		if (current.name !== previous.name) {
			this._logger.verbose('Command <%s> needs updating (trigger: name)', current.name);
			return true;
		}

		if (current.description !== previous.description) {
			this._logger.verbose('Command <%s> needs updating (trigger: description)', current.name);
			return true;
		}

		if (current.defaultPermission !== previous.defaultPermission) {
			this._logger.verbose('Command <%s> needs updating (trigger: defaultPermission)', current.name);
			return true;
		}

		if (!this._compareOptionsRecursive(previous.options ?? [], current.options ?? [])) {
			this._logger.verbose('Command <%s> needs updating (trigger: options)', current.name);
			return true;
		}

		return false;
	}

	/**
	 * Returns `true` if the objects are identical.
	 *
	 * @param a
	 * @param b
	 * @returns
	 */
	private _compareOptionsRecursive(a: any, b: any) {
		// Are these arrays?
		if (Array.isArray(a) || Array.isArray(b)) {
			// We should allow undefined === []
			if (a?.length === 0 && b === undefined) return true;
			if (b?.length === 0 && a === undefined) return true;
		}

		// Check the object
		for (const propName in a) {
			if (!(propName in b)) {
				return false;
			}

			// Normalize types and convert them to their integer forms
			if (propName === 'type') {
				if (typeof a[propName] === 'string') a[propName] = TYPES[a[propName]];
				if (typeof b[propName] === 'string') b[propName] = TYPES[b[propName]];
			}

			// Recurse into objects
			if (typeof a[propName] === 'object' || typeof b[propName] === 'object') {
				if (!this._compareOptionsRecursive(a[propName], b[propName])) {
					return false;
				}
			}

			// Compare values
			else if (a[propName] !== b[propName]) {
				return false;
			}
		}

		// Check for properties in B that are not present in A
		for (const propName in b) {
			if (!(propName in a)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Returns an array of commands that should be available globally.
	 *
	 * @returns
	 */
	public getGlobalCommands() {
		return [...this._commands.values()].filter(c => c.options.global);
	}

	/**
	 * Returns an array of commands that should be localized to guilds.
	 *
	 * @returns
	 */
	public getGuildCommands() {
		return [...this._commands.values()].filter(c => !c.options.global);
	}

}

const TYPES: any = {
	SUB_COMMAND: 1,
	SUB_COMMAND_GROUP: 2,
	STRING: 3,
	INTEGER: 4,
	BOOLEAN: 5,
	USER: 6,
	CHANNEL: 7,
	ROLE: 8,
	MENTIONABLE: 9
};

type Cache = CommandCache | GroupCache;
type CommandCache = BotCommand[];
type GroupCache = BotCommandGroup;
