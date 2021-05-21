import { TaskError } from 'bancho';
import cheerio from 'cheerio';
import fetch from 'node-fetch';

const DEFAULT_AVATAR = 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg';

export class SteamProfile {

	public constructor(public readonly id: string) {

	}

	/**
	 * Fetches the latest comments for the profile.
	 *
	 * @returns
	 */
	public async fetch() {
		const html = await this._download();
		return this._parse(html);
	}

	/**
	 * Downloads the latest page contents.
	 */
	private async _download() {
		const res = await fetch('https://steamcommunity.com/profiles/' + this.id);

		if (res.status !== 200) {
			throw new TaskError(`Got unexpected status code ${res.status}`);
		}

		return await res.text();
	}

	/**
	 * Parses the given HTML into an array of updates.
	 *
	 * @param html
	 */
	private _parse(html: string) {
		const $ = cheerio.load(html);
		const comments = new Array<SteamComment>();

		const elements = $('.commentthread_comment').toArray();

		for (const elementItem of elements) {
			const element = $(elementItem);
			const children = {
				authorName: element.find('.commentthread_comment_author a').first(),
				authorAvatar: element.find('.commentthread_comment_avatar img').first(),
				timestamp: element.find('.commentthread_comment_timestamp').first(),
				text: element.find('.commentthread_comment_text').first()
			};

			// Make sure all the elements are present
			this._validate(children);

			// Add the comment
			comments.push({
				posterName: children.authorName.text().trim(),
				posterLink: children.authorName.attr('href')!,
				posterAvatar: children.authorAvatar.attr('src') ?? DEFAULT_AVATAR,
				timestamp: parseInt(children.timestamp.data('timestamp') ?? 0) * 1000,
				text: children.text.text().trim()
			});
		}

		return comments.filter(comment => comment.text.indexOf('awaiting analysis') < 0 && comment.text.length > 0);
	}

	/**
	 * Checks an array of cheerio instances and throws an error if any are empty.
	 *
	 * @param children
	 */
	 private _validate(children: { [name: string]: cheerio.Cheerio }) {
		for (const name in children) {
			const child = children[name];

			if (child.length === 0) {
				throw new TaskError('Steam comment was missing element "' + name + '"');
			}
		}
	}

}

export interface SteamComment {
	timestamp: number;
	posterName: string;
	posterLink: string;
	posterAvatar: string;
	text: string;
}
