import { APIMessage, WebhookMessageOptions } from 'discord.js';
import { MessageAdditions } from 'discord.js';
import { MessageEmbed } from 'discord.js';
import { Message } from 'discord.js';
import { WebhookEditMessageOptions } from 'discord.js';
import { CommandInteraction, GuildMember, TextChannel } from 'discord.js';
import { UserError } from '../errors';
import { BotCommand } from '../structures/botCommand';

export class CommandEvent {

	private _command: BotCommand;
	private _isReplying = false;
	private _deferPromise?: Promise<void>;

	public constructor(public interaction: CommandInteraction, command: BotCommand) {
		this._command = command;
	}

	/**
	 * The bot this command is running on.
	 */
	public get bot() {
		return this._command.bot;
	}

	/**
	 * The bot client this command is running on.
	 */
	public get client() {
		return this._command.bot.client;
	}

	/**
	 * Returns `true` if this command is being invoked from a private message.
	 */
	public get isDM() {
		return !this.interaction.guild;
	}

	/**
	 * Returns `true` if this command is being invoked from a text chat in a guild.
	 */
	public get isGuild() {
		return !!this.interaction.guild;
	}

	/**
	 * The guild this command was executed from.
	 */
	public get guild() {
		if (!this.interaction.guild) {
			throw new Error('No guild found! Is this a private message?');
		}

		return this.interaction.guild;
	}

	/**
	 * The text channel this command was executed from.
	 */
	public get channel() {
		if (!this.interaction.channel) {
			throw new Error('No channel found!');
		}

		return this.interaction.channel as TextChannel;
	}

	/**
	 * The guild member who called this command. Attempting to access this from a private message will cause an error.
	 *
	 * @returns
	 */
	public get member() {
		const member = this.interaction.member;

		if (!(member instanceof GuildMember)) {
			throw new Error('No member found! Is this a private message?');
		}

		return member;
	}

	/**
	 * Returns the value of the argument at the specified index.
	 *
	 * @param index
	 */
	public getArgument<T>(name: string, required: true): T;
	public getArgument<T>(name: string, required?: false): T | undefined;
	public getArgument<T>(name: string, required?: boolean): T | undefined {
		const option = this.interaction.options.find(opt => opt.name === name);

		// Return the value of the option
		if (option) {
			return option.value as T | undefined;
		}

		// Throw an error if this argument was required
		if (required) {
			throw new Error(`Missing required argument "${name}"`);
		}

		return;
	}

	/**
	 * Returns the target `GuildMember` from an argument. Throws an error for the user if the target is invalid.
	 *
	 * @param name
	 */
	public getArgumentMember(name: string) {
		const id = this.getArgument<string>(name);

		if (typeof id !== 'string') {
			return;
		}

		const member = this.guild.members.resolve(id);

		if (!member) {
			throw new UserError('Invalid target user');
		}

		return member;
	}

	/**
	 * Returns `true` if the specified option was provided in this call.
	 *
	 * @param name
	 * @returns
	 */
	public hasArgument(name: string) {
		return !!this.interaction.options.find(opt => opt.name === name);
	}

	/**
	 * Sends a response to the command.
	 *
	 * @param content
	 */
	public async send(content: string | MessageAdditions | WebhookMessageOptions): Promise<void>;
    public async send(content: string | MessageAdditions, options?: WebhookEditMessageOptions): Promise<void>;
	public async send(content: any, options?: any): Promise<void> {
		this._isReplying = true;

		try {
			// Wait for the message to be deferred if applicable
			if (this._deferPromise) {
				try {
					await this._deferPromise;
				}
				catch (err) {}
			}

			// If we have already replied or deferred, edit the original message
			if (this.interaction.deferred || this.interaction.replied) {
				await this.interaction.editReply(content, options);
			}

			// Otherwise send a new message
			else {
				await this.interaction.reply(content, options);
			}

			this._isReplying = false;
		}
		catch (err) {
			this._isReplying = false;
			throw err;
		}
	}

	/**
	 * Deletes the previous response.
	 *
	 * @returns
	 */
    public deleteReply(): Promise<void> {
		return this.interaction.deleteReply();
	}

	/**
	 * Retrieves the previous response.
	 *
	 * @returns
	 */
	public fetchReply(): Promise<Message | APIMessage> {
		return this.interaction.fetchReply();
	}

	/**
	 * Defers the response.
	 *
	 * @param content
	 */
	public async defer(ephemeral?: boolean | undefined): Promise<void> {
		if (this.interaction.deferred || this.interaction.replied) return;
		if (this._isReplying) return;

		this._deferPromise = this.interaction.defer(ephemeral);
		await this._deferPromise;
	}

}
