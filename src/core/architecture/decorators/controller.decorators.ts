import { Type } from 'bancho/utilities/types';
import { ApplicationCommandOptionChoice } from 'discord.js';
import { Controller } from '../controller';

/**
 * Marks a method as a slash command.
 *
 * @param options
 * @returns
 */
export function Command(options: CommandOptions) {
	return function (_target: any, _property: string, descriptor: TypedPropertyDescriptor<any>) {
		Reflect.defineMetadata('bancho:command', options, descriptor.value);
	}
}

/**
 * Marks a controller as a group. All commands in the controller will be created as subcommands under the given name.
 *
 * @param name
 * @returns
 */
export function Group(name: string) {
	return function (constructor: Type<Controller>) {
		Reflect.defineMetadata('bancho:group', name, constructor);
	}
}

export interface CommandOptions {
	/**
	 * The name of the command as a lowercase, alphabetic string with no special characters.
	 */
	name: string;

	/**
	 * The description to show in the slash command list.
	 */
	description: string;

	/**
	 * The arguments for this command.
	 */
	arguments?: CommandArgument[];

	/**
	 * When set to `true`, the command's response will only be visible for the user who invoked it. Discord calls this
	 * "ephemeral" for some reason.
	 */
	hidden?: boolean;

	/**
	 * When set to `true`, the command will be available in direct messages.
	 */
	global?: boolean;
}

export interface CommandArgument {
	name: string;
	description: string;
	type: ArgumentType;
	required?: boolean;
	choices?: ApplicationCommandOptionChoice[];
	arguments?: CommandArgument[];
}

export enum ArgumentType {
	Subcommand = 'SUB_COMMAND',
	SubcommandGroup = 'SUB_COMMAND_GROUP',
	String = 'STRING',
	Integer = 'INTEGER',
	Boolean = 'BOOLEAN',
	User = 'USER',
	Channel = 'CHANNEL',
	Role = 'ROLE',
	Mentionable = 'MENTIONABLE'
}
