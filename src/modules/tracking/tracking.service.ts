import { DiscordEvent, Service, Store, Task, TaskEvent } from 'bancho';
import { GuildMember, Presence, PresenceStatus, User } from 'discord.js';
import { TrackingEvent } from './tracking.events';

export class TrackingService extends Service {

	/**
	 * Records initial data at startup.
	 */
	public async start() {
		const guilds = this.bot.getGuilds();
		const users = this.bot.getUsers();

		// Record initial user statuses
		for (const user of users) {
			await this._recordUserActivity(user);
		}

		// Record initial member names
		for (const guild of guilds) {
			const members = (await guild.members.fetch()).array();

			for (const member of members) {
				await this._recordMemberName(member);
				this.emit(TrackingEvent.MemberStatusChanged, member);
			}
		}
	}

	/**
	 * Records the status of users when changed and emits a service event for guild members.
	 *
	 * @param before
	 * @param after
	 */
	@DiscordEvent('presenceUpdate')
	public async onPresenceUpdate(before: Presence, after: Presence) {
		const user = after.user ?? after.member!.user;

		// Save their status if applicable
		await this._recordUserActivity(user);

		// Other services might want to track guild member activity
		if (after.member) {
			this.emit(TrackingEvent.MemberStatusChanged, after.member, before);
		}
	}

	/**
	 * Records name changes from guild members.
	 *
	 * @param before
	 * @param after
	 */
	@DiscordEvent('guildMemberUpdate')
	public async onGuildMemberUpdate(before: GuildMember, after: GuildMember) {
		if (before.displayName !== after.displayName) {
			await this._recordMemberName(after);
			this.emit(TrackingEvent.MemberNameChanged, after);
		}
	}

	@Task('0 0 0 * * *', { immediateWhenLate: true })
	public async cleanup(event: TaskEvent) {
		const guilds = this.bot.getGuilds();
		const users = this.bot.getUsers();
		const cutoff = Date.now() - 2592000000;

		let numModifications = 0;

		this.logger.info(
			'Sweeping %d users and %d guild%s',
			users.length,
			guilds.length,
			guilds.length !== 1 ? 's' : ''
		);

		for (const user of users) {
			const store = await this.getUserStore(user);
			const first = store.value.activity[0];

			// Check if the user has entries that can be swept
			if (first && first.timestamp < cutoff) {
				numModifications++;
				store.value.activity = this._getTimeGraph(store, cutoff);
				await store.save();
			}
		}

		for (const guild of guilds) {
			const members = guild.members.cache.array();

			for (const member of members) {
				const store = await this.getMemberStore(member);

				if (store.value.names.length > 100) {
					numModifications++;
					store.value.names = store.value.names.slice(Math.max(store.value.names.length - 5, 0));
					await store.save();
				}
			}
		}

		if (numModifications > 0) {
			this.logger.info(
				'Finished sweeping (%d modification%s)',
				numModifications,
				numModifications !== 1 ? 's' : ''
			);
		}
		else {
			this.logger.info('Finished sweeping (nothing to do)');
		}
	}

	/**
	 * Records the given user's current status if needed.
	 *
	 * @param user
	 */
	private async _recordUserActivity(user: User) {
		const store = await this.getUserStore(user);
		const presence = user.presence;

		const lastActivity = store.value.activity[store.value.activity.length - 1];
		const mobile = presence.clientStatus?.mobile === 'online';

		// Check if the current status is different from before
		if (!lastActivity || (lastActivity.status !== presence.status || lastActivity.mobile !== mobile)) {
			store.value.activity.push({
				status: presence.status,
				mobile,
				timestamp: Date.now()
			});

			store.save();
		}
	}

	/**
	 * Records the given members's current name if needed.
	 *
	 * @param member
	 */
	private async _recordMemberName(member: GuildMember) {
		const store = await this.getMemberStore(member);
		const name = member.displayName;
		const lastName = store.value.names[store.value.names.length - 1];

		if (!lastName || lastName.name !== name) {
			store.value.names.push({
				name,
				timestamp: Date.now()
			});

			store.save();
		}
	}

	/**
	 * Returns the data store for the given user.
	 *
	 * @param user
	 */
	public async getUserStore(user: User) {
		return this.createStoreAsync<UserStore>('users/' + user.id, {
			activity: []
		});
	}

	/**
	 * Returns the data store for the given user.
	 *
	 * @param member
	 */
	public async getMemberStore(member: GuildMember) {
		return this.createStoreAsync<MemberStore>('members/' + member.guild.id + '/' + member.id, {
			names: []
		});
	}

	/**
	 * Returns statistics about a user's activity since the given millisecond timestamp.
	 *
	 * @param user
	 * @param since
	 */
	public async getUserStatistics(user: User, since: number) {
		const currentTime = Date.now();
		const store = await this.getUserStore(user);
		const graph = this._getTimeGraph(store, since);

		let totalTimeOnline = 0;
		let totalTimeMobile = 0;

		for (let index = 0; index < graph.length; index++) {
			const record = graph[index];
			const nextRecord = graph[index + 1];
			const duration = nextRecord ? nextRecord.timestamp - record.timestamp : currentTime - record.timestamp;

			if (record.status === 'online') {
				totalTimeOnline += duration;

				if (record.mobile) {
					totalTimeMobile += duration;
				}
			}
		}

		const totalHours = +(totalTimeOnline / 3600000).toFixed(1);
		const totalHoursMobile = +(totalTimeMobile / 3600000).toFixed(1);

		return {
			since,
			events: graph.length,
			total: {
				millis: totalTimeOnline,
				hours: totalHours,
				hoursLabel: 'hour' + (totalHours !== 1.0 ? 's' : '')
			},
			mobile: {
				millis: totalTimeMobile,
				hours: totalHoursMobile,
				hoursLabel: 'hour' + (totalHoursMobile !== 1.0 ? 's' : '')
			}
		};
	}

	/**
	 * Returns an array of activity records based on the given time. The first record in the array is guaranteed to
	 * have a timestamp equal to `since`.
	 *
	 * @param store
	 * @param since
	 * @returns
	 */
	private _getTimeGraph(store: Store<UserStore>, since: number): UserActivityRecord[] {
		const activities = store.value.activity;

		// Find the index of the first activity since the given time
		const firstIndex = activities.findIndex(change => change.timestamp >= since);

		// If there isn't a match, return the last item with its time mutated
		if (firstIndex < 0) {
			const last = activities[activities.length - 1];

			return [{
				status: last.status,
				mobile: last.mobile,
				timestamp: since
			}];
		}

		// If the match is the first element in the array, return the array directly
		if (firstIndex === 0) {
			return activities;
		}

		// Otherwise slice the activities after our index
		const matches = activities.slice(firstIndex);

		// Add the element before the match with its time mutated
		const before = activities[firstIndex - 1];
		matches.unshift({
			status: before.status,
			mobile: before.mobile,
			timestamp: since
		});

		return matches;
	}

}

export interface UserStore {
	activity: UserActivityRecord[];
}

export interface UserActivityRecord {
	status: PresenceStatus;
	mobile: boolean;
	timestamp: number;
}

export interface MemberStore {
	names: MemberNameRecord[];
}

export interface MemberNameRecord {
	name: string;
	timestamp: number;
}
