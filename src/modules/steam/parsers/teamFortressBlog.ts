import { TaskError } from 'bancho';
import cheerio from 'cheerio';
import moment from 'moment';
import fetch from 'node-fetch';

export class TeamFortressBlog {

	public constructor() {

	}

	/**
	 * Fetches the latest updates.
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
		const res = await fetch('https://www.teamfortress.com/?tab=updates');

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
		const links = $('a.postLink');
		const updates = new Array<Update>();

		for (const link of links) {
			updates.push(this._parsePost($, $(link)));
		}

		return updates;
	}

	/**
	 * Parses the given link and its sibling elements into a post.
	 *
	 * @param $
	 * @param element
	 * @returns
	 */
	private _parsePost($: cheerio.Root, element: cheerio.Cheerio): Update {
		const children = element.nextUntil('iframe');

		// Get the link and post id
		const postLink = element.attr('href') as string;
		const postId = parseInt(postLink.substring(postLink.indexOf('=') + 1));

		// Get the first paragraph which will contain a description
		let postDescription = children.filter('p').first().text().trim();

		// Remove newlines from the description
		if (postDescription.indexOf('\n') > 0) {
			postDescription = postDescription.substring(0, postDescription.indexOf('\n')).trim();
		}

		// Get the title of the post
		const postTitle = children.filter('h2').first().text().trim();

		// Get the date and timestamp
		const postDateText = postTitle.substring(0, postTitle.indexOf(' - '));
		const postDate = moment.tz(postDateText, 'MMMM D, YYYY', 'UTC');

		// Parse the changelog
		const changelog = new Array<UpdateChangelogItem>();
		const list = children.filter('ul').first().children();

		for (const itemElement of list) {
			changelog.push(...this._parseList($, $(itemElement)));
		}

		return {
			post: {
				id: postId,
				title: element.text().trim(),
				description: postDescription,
				link: 'https://www.teamfortress.com/' + postLink,
				subtitle: postTitle,
				timestamp: postDate.valueOf()
			},
			changelog
		};
	}

	/**
	 * Recursively parses a `<li>` element and its children into a list of changelog items.
	 *
	 * @param $
	 * @param list
	 * @returns
	 */
	private _parseList($: cheerio.Root, list: cheerio.Cheerio): UpdateChangelogItem[] {
		const changelog = new Array<UpdateChangelogItem>();

		for (const itemElement of list) {
			const item = $(itemElement);
			const clone = item.clone();

			clone.children().remove();

			const text = clone.text().trim();
			const sublist = item.children().filter('ul').first().children();
			const children = sublist.length > 0 ? this._parseList($, sublist) : [];

			changelog.push({
				description: text,
				children
			});
		}

		return changelog;
	}

	/**
	 * Returns the text in an element, excluding text from child elements.
	 *
	 * @param element
	 */
	private _getDirectText(element: cheerio.Cheerio) {
		return element.contents().filter(function(this: cheerio.Element) {
			return this.type === 'text';
		}).text().trim();
	}

}

export interface Update {
	post: UpdatePost;
	changelog: UpdateChangelogItem[];
}

export interface UpdatePost {
	id: number;
	link: string;
	title: string;
	subtitle: string;
	description: string;
	timestamp: number;
}

export interface UpdateChangelogItem {
	description: string;
	children: UpdateChangelogItem[];
}
