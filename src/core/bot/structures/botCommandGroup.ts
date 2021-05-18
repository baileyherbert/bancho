import { Controller } from 'bancho/architecture/controller';
import { ArgumentType, CommandOptions } from 'bancho/architecture/decorators/controller.decorators';
import { ReflectionMethod } from 'bancho/utilities/reflection/reflection.method';
import { CommandEvent } from '../events/commandEvent';

/**
 * This class helps combine multiple commands into a single monocommand for grouping.
 */
export class BotCommandGroup {

	private _commands = new Map<string, Command>();
	private _cache = new Map<Controller, Command[]>();
	private _options: CommandOptions;

	public constructor(name: string) {
		this._options = {
			name,
			description: `The ${name} command group.`,
			arguments: []
		};
	}

	/**
	 * Adds methods from a controller into the group. You can mix commands from several different controllers into one
	 * group this way.
	 *
	 * @param controller
	 * @param methods
	 */
	public register(controller: Controller, methods: ReflectionMethod<Controller>[]) {
		for (const method of methods) {
			const command = method.getMetadata<CommandOptions>('bancho:command')!;
			const closure = method.getClosure(controller);

			// Add the argument to the monocommand
			this._options.arguments?.push({
				name: command.name,
				description: command.description,
				type: ArgumentType.Subcommand,
				arguments: command.arguments
			});

			// Register the command's closure
			this._commands.set(command.name, {
				options: command,
				closure
			});
		}
	}

	/**
	 * Removes methods on a controller from the group.
	 *
	 * @param controller
	 */
	public deregister(controller: Controller) {
		if (this._cache.has(controller)) {
			for (const command of this._cache.get(controller)!) {
				this._commands.delete(command.options.name);

				if (this._options.arguments) {
					this._options.arguments = this._options.arguments.filter(arg => arg.name !== command.options.name);
				}
			}

			this._cache.delete(controller);
		}
	}

	/**
	 * The options to use for the fake group command.
	 */
	public get options() {
		return this._options;
	}

	/**
	 * A closure that disguises this group as a normal command. Behind the scenes, the target subcommand will be
	 * extracted from the interaction options and invoked.
	 */
	public get closure() {
		return (event: CommandEvent) => {
			const subcommand = event.interaction.options[0];

			// This should never happen but it's protection against misusing this class
			if (subcommand?.type !== 'SUB_COMMAND') {
				throw new Error('Expected a subcommand, got ' + subcommand?.type.toString());
			}

			const commandName = subcommand.name;
			const commandOptions = subcommand.options ?? [];
			const command = this._commands.get(commandName);

			// Throw an error if the command doesn't exist in the group
			// This should never happen unless there's a webhook exploit or something...
			if (command === undefined) {
				throw new Error('Attempt to invoke unknown command ' + commandName);
			}

			// Replace values in the interaction
			event.interaction.commandName = event.interaction.commandName + '.' + commandName;
			event.interaction.options = commandOptions;

			// Invoke the closure
			return command.closure(event);
		};
	}

}

interface Command {
	options: CommandOptions;
	closure: (event: CommandEvent) => any;
}
