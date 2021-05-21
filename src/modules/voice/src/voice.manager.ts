import { EventEmitter } from 'bancho/utilities/events';
import { Guild, GuildMember, VoiceChannel, VoiceConnection } from 'discord.js';

export class VoiceManager extends EventEmitter<Events> {

	private _guild: Guild;
	private _channel?: VoiceChannel;
	private _connection?: VoiceConnection;

	public constructor(guild: Guild) {
		super();

		this._guild = guild;
	}

	/**
	 * The current voice connection. This is used to send audio into the voice channel.
	 */
	public get connection() {
		return this._connection;
	}

	/**
	 * The current voice channel.
	 */
	public get channel() {
		return this._channel;
	}

	/**
	 * Connects to the specified channel.
	 *
	 * @param channel
	 */
	public async connect(channel: VoiceChannel) {
		// Make sure this is a valid request
		if (channel.guild !== this._guild) {
			throw new Error('Target channel is not in the current guild');
		}

		// Don't join if we're already in the channel
		if (this._channel === channel && this._connection) {
			return;
		}

		// Set the connection
		this._connection = await channel.join();
		this._channel = channel;
		this._emit('voiceChannelConnected', channel);

		// Listen for disconnects
		this._connection.once('disconnect', () => this.disconnect());
	}

	/**
	 * Disconnects from the current channel if applicable.
	 */
	public disconnect() {
		if (this._connection !== undefined && this._channel !== undefined) {
			this._connection.disconnect();
			this._connection = undefined;
			this._emit('voiceChannelDisconnected', this._channel);
			this._channel = undefined;
		}
	}

	/**
	 * Internal method to mark a member of the voice channel as disconnected.
	 *
	 * @param member
	 */
	 protected setMemberDisconnected(member: GuildMember) {
		if (member === member.guild.me) {
			this._emit('voiceChannelDisconnected', this._channel!);
			this._channel = undefined;
			this._connection = undefined;
			return;
		}

		this._emit('memberDisconnected', member);

		if (this.channel !== undefined) {
			const members = this.channel.members.array().filter(m => m.guild.me !== m);

			if (members.length === 0) {
				this._emit('voiceChannelEmpty');
			}
		}
	}

	/**
	 * Internal method to mark a member of the guild as connected to the voice channel.
	 *
	 * @param member
	 */
	 protected setMemberConnected(member: GuildMember) {
		this._emit('memberConnected', member);
	}

	/**
	 * Internal method to change the channel that the bot is in.
	 *
	 * @param channel
	 */
	protected setMoved(channel: VoiceChannel) {
		if (channel !== this._channel) {
			this._channel = channel;
			this._emit('voiceChannelMoved', channel);
		}
	}

}

type Events = {
	/**
	 * Emitted when all members have left the channel except the bot.
	 */
	voiceChannelEmpty: [];

	/**
	 * Emitted when the manager connects to a voice channel.
	 */
	voiceChannelConnected: [channel: VoiceChannel];

	/**
	 * Emitted when the manager disconnects from its voice channel.
	 */
	voiceChannelDisconnected: [channel: VoiceChannel];

	/**
	 * Emitted when the bot is moved to a different voice channel by a guild admin.
	 */
	voiceChannelMoved: [channel: VoiceChannel];

	/**
	 * Emitted when a member connects to the current voice channel.
	 */
	memberConnected: [member: GuildMember];

	/**
	 * Emitted when a member disconnects from the current voice channel.
	 */
	memberDisconnected: [member: GuildMember];
};
