import { CommandArgument, CommandOptions } from 'bancho/architecture/decorators/controller.decorators';
import { ApplicationCommandData, ApplicationCommandOptionData } from 'discord.js';
import { Bot } from '../../bot';

export class BotCommand {

	/**
	 * Constructs a new `BotCommand` instance.
	 *
	 * @param bot The bot instance.
	 * @param options The original options for this command.
	 * @param callback The callback to use when invoking this command.
	 */
	public constructor(public bot: Bot, public options: CommandOptions, public callback: (...args: any[]) => any) {

	}

	/**
	 * Returns an object containing the application command data, which can be sent directly to Discord to register
	 * this command on a guild or globally.
	 *
	 * @returns
	 */
	public getData(): ApplicationCommandData {
		return {
			name: this.options.name,
			description: this.options.description,
			options: this._getOptions(this.options.arguments),
			defaultPermission: true
		};
	}

	/**
	 * Reformats command arguments into application command option objects.
	 *
	 * @param arr
	 * @returns
	 */
	private _getOptions(arr: CommandArgument[] | undefined | null): ApplicationCommandOptionData[] | undefined {
		if (arr) {
			return arr.map(opt => ({
				type: opt.type,
				name: opt.name,
				description: opt.description,
				required: opt.required,
				choices: opt.choices,
				options: this._getOptions(opt.arguments ?? null)
			}));
		}

		return;
	}

}
