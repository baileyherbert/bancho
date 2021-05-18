import { Service, Task, TaskEvent } from 'bancho';
import fetch from 'node-fetch';
import cheerio from 'cheerio';
import { MessageEmbed, TextChannel } from 'discord.js';
import { TeamFortressBlog, Update, UpdateChangelogItem } from './parsers/teamFortressBlog';

export class SteamService extends Service {

	/**
	 * The configuration file for the service.
	 */
	public readonly config = this.createConfig<SteamConfig>({
		updatesChannelIds: []
	});

	/**
	 * The store for the last known update post ID.
	 */
	private _store = this.createStore<number>('updates/tf2');

	@Task('0 */15 * * * *', { immediateFirstRun: true, immediateWhenLate: true })
	public async checkForUpdates(event: TaskEvent) {
		const blog = new TeamFortressBlog();
		const updates = (await blog.fetch()).reverse();

		// Iterate over the updates and look for anything new
		for (const update of updates) {
			if (typeof this._store.value === 'number' && update.post.timestamp > this._store.value) {
				await this._announceUpdate(event, update);
			}
		}

		// Update the latest timestamp
		if (updates.length > 0) {
			this._store.write(updates[updates.length - 1].post.timestamp);
		}
	}

	/**
	 * Posts about a new update in the correct channel.
	 *
	 * @param update
	 */
	private async _announceUpdate(event: TaskEvent, update: Update) {
		const description = update.post.description + "\n\n";
		const changelog = this._getChangeLog(update, description.length, 4);

		this.logger.info('Announcing update for post %d', update.post.id);

		for (const channelId of this.config.value.updatesChannelIds) {
			const channel = await event.bot.client.channels.fetch(channelId) as TextChannel;

			if (channel !== undefined) {
				await channel.send(new MessageEmbed({
					author: {
						icon_url: 'https://i.bailey.sh/MNZmxRI.png',
						name: 'Team Fortress 2'
					},
					title: update.post.title,
					url: update.post.link,
					description: description + changelog,
					footer: {
						text: update.post.subtitle
					}
				}));
			}
		}
	}

	/**
	 * Builds and returns the changelog for the given update as a string for a message embed.
	 *
	 * This will automatically account for the 2048 character limit on the embed text. If you intend on appending text
	 * to this response, make sure to supply the number of extra characters added in `startLength`.
	 *
	 * The `maxDepth` option determines the maximum list depth. If there's not enough room for the list at the given
	 * depth, then the depth will be reduced until the list fits within the character limit.
	 *
	 * @param update
	 * @param startLength
	 * @param maxDepth
	 */
	private _getChangeLog(update: Update, startLength = 0, maxDepth = 1, tooLarge = false): string {
		for (let depth = maxDepth; depth >= 1; depth--) {
			let output = '';

			for (const item of update.changelog) {
				const line = this._getChangelogItem(item, startLength + output.length, depth) + '\n';

				if (maxDepth === 1 && output.length + startLength + line.length > 2048) {
					continue;
				}

				output += line;
			}

			if (output.length + startLength > 2048) {
				return this._getChangeLog(update, startLength, maxDepth - 1, true);
			}

			const fullLinkNotice = `• **Click [here](${update.post.link}) for the full list!**`;;

			if (tooLarge && output.length + startLength <= 2048 - fullLinkNotice.length) {
				output += fullLinkNotice;
			}

			return output.trim();
		}

		return 'Unavailable';
	}

	/**
	 * Converts a single changelog item to a string with the given indentation and includes children of the specified
	 * depth.
	 *
	 * @param changelog
	 * @param startLength
	 * @param depth
	 * @param indent
	 * @returns
	 */
	private _getChangelogItem(changelog: UpdateChangelogItem, startLength = 0, depth = 1, indent = 0) {
		let description = ' '.repeat(indent * 2) + '• ' + changelog.description;

		if (changelog.children.length > 0 && depth > 1) {
			for (const child of changelog.children) {
				description += '\n';
				description += this._getChangelogItem(child, startLength + description.length, depth - 1, indent + 1);
			}
		}

		return description;
	}

}

interface SteamConfig {
	updatesChannelIds: string[];
}
