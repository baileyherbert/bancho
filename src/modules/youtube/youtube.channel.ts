import fetch from 'node-fetch';
import jsonpath from 'jsonpath';
import moment from 'moment-timezone';

export class YouTubeChannel {

	public constructor(public readonly id: string) {

	}

	/**
	 * Returns the first page of this channel's latest videos, sorted in logical order from newest to oldest.
	 *
	 * @returns
	 */
	public async getLatestVideos() {
		const html = await this._download(`https://www.youtube.com/channel/${this.id}/videos`);
		const data = this._extract(html);

		return this._parseVideoGrid(data);
	}

	/**
	 * Returns the next live stream for this channel if available, or `undefined` otherwise.
	 */
	public async getUpcomingLivestream(): Promise<UpcomingLiveVideo | undefined> {
		const html = await this._download(`https://www.youtube.com/channel/${this.id}`);
		const data = this._extract(html);
		const renderers = jsonpath.query(data, '$..itemSectionRenderer');

		for (const renderer of renderers) {
			const title = jsonpath.query(renderer, '$..title.runs..text')[0];

			// Skip if the title is missing or not relevant
			if (!title || title.indexOf('live streams') < 0) {
				continue;
			}

			const videoRenderers = jsonpath.query(renderer, '$..videoRenderer');

			for (const video of videoRenderers) {
				const id = video.videoId;
				const url = 'https://www.youtube.com/watch?v=' + id;
				const title = jsonpath.query(video, '$..title..simpleText').join('');

				return {
					id,
					url,
					title
				};
			}
		}

		return;
	}

	/**
	 * Resolves information about the given video. In particular, fetches a more accurate timestamp and the
	 * video's full description.
	 *
	 * @param video
	 * @returns
	 */
	public async getVideoDetails(video: ChannelGridVideo) {
		const html = await this._download(video.url);
		const data = this._extract(html);

		const title = jsonpath.query(data, '$..videoPrimaryInfoRenderer.title..text').join('').trim();
		const description = jsonpath.query(data, '$..description..text').join('').trim();
		const date = jsonpath.query(data, '$..dateText.simpleText')[0].trim();
		const timestamp = moment.tz(date, 'MMM D, YYYY', 'America/Los_Angeles').valueOf();

		return {
			...video,
			title,
			description,
			timestamp
		};
	}

	/**
	 * Downloads the channel's page and returns the HTML.
	 *
	 * @returns
	 */
	private async _download(url: string) {
		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
							  'Chrome/88.0.4324.150 Safari/537.36'
			}
		});

		if (response.status !== 200) {
			throw new Error('Got status code ' + response.status);
		}

		return response.text();
	}

	/**
	 * Extracts the JSON content of `ytInitialData`.
	 *
	 * @param html
	 * @returns
	 */
	private _extract(html: string) {
		// The data we're looking for is encoded into a JavaScript variable
		// Let's use regular expressions to extract it
		const match = html.match(/var ytInitialData = (.+);\<\/script\>/);

		if (!match) {
			throw new Error('Failed to extract ytInitialData');
		}

		return JSON.parse(match[1]);
	}

	/**
	 * Parses the given HTML into search result objects.
	 *
	 * @param html
	 */
	 private _parseVideoGrid(data: any) {
		const renderers = jsonpath.query(data, '$..gridVideoRenderer');
		const videos = new Array<ChannelGridVideo>();

		for (const renderer of renderers) {
			const id = renderer.videoId;
			const url = 'https://www.youtube.com/watch?v=' + id;
			const titleTexts = jsonpath.query(renderer, '$..title..text');
			const title = titleTexts.join('').trim();
			const timeText = renderer.publishedTimeText?.simpleText;
			const liveText = jsonpath.query(renderer, '$..thumbnailOverlayTimeStatusRenderer..style');
			const live = liveText.length > 0 && liveText[0] === 'LIVE';

			videos.push({
				id,
				url,
				title,
				timestamp: this._parseTimestamp(timeText),
				live
			});
		}

		return videos;
	}

	/**
	 * Converts a phrase such as "2 seconds ago" into an approximate timestamp.
	 *
	 * @param input
	 * @returns
	 */
	private _parseTimestamp(input?: string) {
		if (input === undefined) {
			return;
		}

		const table: { [key: string]: number } = {
			second: 1000,
			minute: 1000 * 60,
			hour: 1000 * 60 * 60,
			day: 1000 * 60 * 60 * 24,
			week: 1000 * 60 * 60 * 24 * 7,
			month: 1000 * 60 * 60 * 24 * 30,
			year: 1000 * 60 * 60 * 24 * 365,
		};

		const parts = input.trim().match(/^(?:Streamed )?(\d+) +(\w+) +ago$/);
		if (!parts) {
			throw new Error('Timestamp parse error');
		}

		const quantity = +parts[1];
		const unit = parts[2].replace(/s$/, '');

		if (isNaN(quantity)) {
			throw new Error('Invalid timestamp quantity: ' + parts[1]);
		}

		if (!(unit in table)) {
			throw new Error('Unknown timestamp unit: ' + unit);
		}

		const millisAgo = table[unit] * quantity;
		const timestamp = Date.now() - millisAgo;

		return timestamp;
	}

}

export interface ChannelGridVideo {
	id: string;
	url: string;
	title: string;
	timestamp?: number;
	live: boolean;
}

export interface UpcomingLiveVideo {
	id: string;
	url: string;
	title: string;
}
