import { Service, Store, Task, TaskEvent } from 'bancho';
import { TextChannel } from 'discord.js';
import { ChannelGridVideo, YouTubeChannel } from './youtube.channel';
import moment from 'moment-timezone';

export class YouTubeService extends Service {

	public config = this.createConfig<YouTubeConfig>({
		channels: [],
		spacex: []
	});

	private _channels = new Array<IChannel>();
	private _spacex = new YouTubeChannel('UCtI0Hodo5o5dUb67FeUjDeA');

	private _launchReminders = new Map<string, NodeJS.Timeout>();

	/**
	 * Starts the service.
	 */
	public async start() {
		for (const config of this.config.value.channels) {
			this._channels.push({
				config,
				fetcher: new YouTubeChannel(config.id)
			});
		}

		// Resume launch announcements
		const store = await this.createStoreAsync<LaunchAnnouncement[]>('channels/spacex/launch', []);
		for (const announcement of store.value) {
			await this._scheduleLaunchAnnouncement(announcement.timestamp, announcement.id);
		}
	}

	/**
	 * Checks for new videos on monitored channels.
	 *
	 * @param event
	 */
	@Task('0 */5 * * * *', { immediateFirstRun: true, immediateWhenLate: true, numReattempts: 5 })
	protected async fetchNewVideos(event: TaskEvent) {
		for (const channel of this._channels) {
			const videos = await channel.fetcher.getLatestVideos();
			const store = await this.createStoreAsync<string[]>(`channels/${channel.config.id}`, []);
			const result = this._processNewVideos(store, videos);

			// Save new videos
			if (result.videos.length > 0) {
				this.logger.info(
					'Got %d new video%s for channel: %s',
					result.videos.length,
					result.videos.length !== 1 ? 's' : '',
					channel.config.id
				);

				// Post announcements
				if (result.announce) {
					const target = await event.bot.client.channels.fetch(channel.config.channelId) as TextChannel;

					if (!target) {
						throw new Error('Unable to find channel: ' + channel.config.channelId);
					}

					for (const video of result.videos) {
						this.logger.info('Announcing new video: %s - %s', video.id, video.title);
						await target.send('**New video!** ' + video.url);
					}
				}
			}
		}
	}

	/**
	 * Checks for new SpaceX launches.
	 *
	 * @param event
	 * @returns
	 */
	@Task('0 */5 * * * *', { immediate: true })
	protected async getSpaceXLaunches(event: TaskEvent) {
		if (this.config.value.spacex.length === 0) {
			return;
		}

		const store = await this.createStoreAsync<string[]>(`channels/spacex/videos`, []);
		const videos = await this._spacex.getLatestVideos();
		const result = this._processNewVideos(store, videos);

		for (const video of result.videos) {
			if (video.live && video.title.endsWith('Mission')) {
				this.logger.info('Detected new launch stream: %s - %s', video.id, video.title);
				this.logger.info('Fetching approximate launch time...');

				const details = await this._spacex.getVideoDetails(video);
				const regex = /(\d+:\d+) UTC/i;
				const match = details.description.match(regex);

				if (!match) {
					this.logger.error('Failed to detect launch time from the video description!');
					continue;
				}

				const launchTime = moment.tz(match[1], 'H:mm', 'UTC');

				this.logger.info('Got launch time: %s (%s)', launchTime.format(), launchTime.fromNow());
				await this._scheduleLaunchAnnouncement(launchTime.valueOf(), video.id);
			}
		}
	}

	/**
	 * Processes the given array of grid videos. Adds new videos to the given store, and returns an array of new videos
	 * in order from oldest to newest. The `announce` property in the returned object will be true if the new video
	 * should be announced.
	 *
	 * @param store
	 * @param videos
	 * @returns
	 */
	private _processNewVideos(store: Store<string[]>, videos: ChannelGridVideo[]) {
		const newVideos = new Array<ChannelGridVideo>();
		const announce = store.value.length > 0;
		const history = new Set(store.value);

		for (const video of videos) {
			if (history.has(video.id) && !video.live) {
				break;
			}

			if (!history.has(video.id)) {
				newVideos.push(video);
			}
		}

		// Save new videos
		if (newVideos.length > 0) {
			store.value.unshift(...newVideos.map(v => v.id));
			store.save();
		}

		return {
			videos: newVideos.reverse(),
			announce
		};
	}

	/**
	 * Sets an internal timeout to announce a rocket launch with the liftoff timestamp and livestream video ID.
	 * The announcement will go out a few minutes before the given timestamp.
	 *
	 * @param timestamp
	 * @param id
	 * @returns
	 */
	private async _scheduleLaunchAnnouncement(timestamp: number, id: string) {
		if (this._launchReminders.has(id)) {
			return;
		}

		const store = await this.createStoreAsync<LaunchAnnouncement[]>('channels/spacex/launch', []);
		let resumed = true;

		if (!store.value.find(a => a.id === id)) {
			resumed = false;

			store.value.push({
				timestamp,
				id
			});

			store.save();
		}

		const millisRemaining = timestamp - Date.now();
		const announceTime = millisRemaining - (60000 * 5);
		const announceTimeMoment = moment(timestamp - (60000 * 5));

		if (millisRemaining > 0) {
			const timeout = setTimeout(() => this._announceLaunch(timestamp, id), announceTime)
			this._launchReminders.set(id, timeout);
			this.logger.info(
				'%s launch announcement for %s in %s',
				resumed ? 'Resumed' : 'Scheduled',
				id,
				announceTimeMoment.fromNow(true)
			);
		}
		else {
			store.value = store.value.filter(a => a.id !== id);
			store.save();
		}
	}

	/**
	 * Announces a launch in all configured channels.
	 *
	 * @param timestamp
	 * @param id
	 */
	private async _announceLaunch(timestamp: number, id: string) {
		this.logger.info('Announcing launch: %s', id);

		// Get the launch time
		const time = moment(timestamp);

		// Post in channels
		for (const config of this.config.value.spacex) {
			const channel = await this.bot.client.channels.fetch(config.channelId) as TextChannel;
			const mention = '<@' + config.mention + '>';

			await channel.send(`**${mention}  Liftoff in ${time.fromNow(true)}!**\nhttps://www.youtube.com/watch?v=${id}`);
		}

		// Remove from the store
		const store = await this.createStoreAsync<LaunchAnnouncement[]>('channels/spacex/launch', []);
		store.value = store.value.filter(a => a.id !== id);
		store.save();

		// Remove the timeout from local cache
		this._launchReminders.delete(id);
	}

}

interface YouTubeConfig {
	channels: YouTubeChannelConfig[];
	spacex: SpaceXChannelConfig[];
}

interface YouTubeChannelConfig {
	id: string;
	channelId: string;
}

interface SpaceXChannelConfig {
	channelId: string;
	mention: string;
}

interface IChannel {
	config: YouTubeChannelConfig;
	fetcher: YouTubeChannel;
}

interface LaunchAnnouncement {
	timestamp: number;
	id: string;
}
