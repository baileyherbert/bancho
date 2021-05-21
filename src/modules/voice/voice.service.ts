import { DiscordEvent, Service } from 'bancho';
import { Guild, GuildMember, VoiceChannel, VoiceState } from 'discord.js';
import { VoiceManager } from './src/voice.manager';

/**
 * This service helps manage voice connections for individual guilds. After retrieving a voice manager from this
 * service, you can easily manage outgoing sounds.
 */
export class VoiceService extends Service {

	private _managers = new Map<string, VoiceManager>();

	/**
	 * Starts the voice service.
	 */
	public async start() {
		this._managers = new Map();
	}

	/**
	 * Disconnects from all voice channels.
	 */
	public stop() {
		for (const manager of this._managers.values()) {
			manager.disconnect();
		}
	}

	/**
	 * Returns the voice manager for the specified guild.
	 *
	 * @param guild
	 */
	public getVoiceManager(guild: Guild) {
		if (!this._managers.has(guild.id)) {
			this._managers.set(guild.id, new VoiceManager(guild));
		}

		return this._managers.get(guild.id)!;
	}

	/**
	 * Returns the voice channels in a guild. The most populated channels will be first.
	 *
	 * @param guild
	 */
	public getVoiceChannels(guild: Guild) {
		const channels = new Array<VoiceChannelResult>();

		for (const channel of guild.channels.cache.array()) {
			if (channel.type === 'voice' && channel instanceof VoiceChannel) {
				channels.push({
					channel,
					members: channel.members.array()
				});
			}
		}

		return channels.sort((a, b) => a.members.length < b.members.length ? 1 : -1);
	}

	/**
	 * Returns the voice channel that the given member is currently in or `undefined` if they are not in a channel.
	 *
	 * @param member
	 */
	public getMemberVoiceChannel(member: GuildMember) {
		return (member.voice.channel as VoiceChannel | undefined) ?? undefined;
	}

	/**
	 * Returns the voice channel with the highest member count that the bot can access, or `undefined` if there are no
	 * channels with active participants.
	 *
	 * @param guild
	 */
	public getBestVoiceChannel(guild: Guild) {
		const channels = this.getVoiceChannels(guild);

		if (channels.length === 0 || channels[0].members.length === 0) {
			return;
		}

		return channels[0];
	}

	/**
	 * Updates managers when users connect and disconnect from voice channels.
	 *
	 * @param old
	 * @param current
	 */
	@DiscordEvent('voiceStateUpdate')
	public async onVoiceState(old: VoiceState, current: VoiceState) {
		const manager = this._managers.get(current.guild.id);

		if (manager !== undefined && manager.channel) {
			// Check if this is the bot being moved or disconnected
			if (current.member === current.guild.me && current.channel?.id !== manager.channel.id) {
				if (current.channel) {
					// @ts-ignore
					manager.setMoved(current.channel);
				}
				else {
					// @ts-ignore
					manager.setMemberDisconnected(current.member!);
				}
			}

			// Check if the user is leaving the channel
			else if (manager.channel.id === old.channel?.id && current.channel?.id !== manager.channel.id) {
				// @ts-ignore
				manager.setMemberDisconnected(current.member!);
			}

			// Check if they are joining the channel
			else if (manager.channel.id === current.channel?.id && old.channel?.id !== manager.channel.id) {
				// @ts-ignore
				manager.setMemberConnected(current.member!);
			}
		}
	}

}

export interface VoiceChannelResult {
	channel: VoiceChannel;
	members: GuildMember[];
}
