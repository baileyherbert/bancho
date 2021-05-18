import { ArgumentType, Command, CommandEvent, Controller, Group } from 'bancho';

@Group('music')
export class MusicController extends Controller {

	/**
	 * Adds a song to the queue. The song can be either a link or a search query.
	 *
	 * @param event
	 */
	@Command({
		name: 'play',
		description: 'Adds a song to the queue.',
		arguments: [
			{
				name: 'song',
				description: 'Link to a song or enter a search term.',
				type: ArgumentType.String,
				required: true
			}
		]
	})
	public onMusicPlay(event: CommandEvent) {
		console.log('play', event.interaction.options);
	}

	/**
	 * Toggles looping on the current song. The bot will continue playing the song until the song is skipped, the bot
	 * is kicked from the call, or all users in the voice channel leave.
	 *
	 * @param event
	 */
	@Command({
		name: 'loop',
		description: 'Toggles looping on the current song.',
		arguments: []
	})
	public onMusicLoop(event: CommandEvent) {
		console.log('loop', event.interaction.options);
	}

	/**
	 * Skips the current song in the queue. If there are no other songs in the queue, the bot will disconnect from the
	 * voice call.
	 *
	 * @param event
	 */
	@Command({
		name: 'skip',
		description: 'Skips the current song.',
		arguments: []
	})
	public onMusicSkip(event: CommandEvent) {
		console.log('skip', event.interaction.options);
	}

	/**
	 * Stops the queue and disconnects from the voice channel.
	 *
	 * @param event
	 */
	@Command({
		name: 'stop',
		description: 'Disconnects from the voice channel.',
		arguments: []
	})
	public onMusicStop(event: CommandEvent) {
		console.log('stop', event.interaction.options);
	}

	/**
	 * Lists songs in the queue.
	 *
	 * @param event
	 */
	@Command({
		name: 'queue',
		description: 'Lists all songs in the queue.',
		arguments: []
	})
	public onMusicQueue(event: CommandEvent) {
		console.log('queue', event.interaction.options);
	}

}
