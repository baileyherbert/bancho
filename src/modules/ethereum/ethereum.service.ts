import { DiscordEvent, Service, ServiceEvent, Store, Task, TaskEvent } from 'bancho';
import fetch from 'node-fetch';
import moment from 'moment-timezone';
import { GuildMember, Message, MessageEmbed, Presence, TextChannel } from 'discord.js';
import { EthereumEvent } from './ethereum.events';
import { TrackingEvent } from '@modules/tracking/tracking.events';

export class EthereumService extends Service {

	private _stats = this.createStore<EthereumStats>('statistics');
	private _history = this.createStore<EthereumStats[]>('history', []);

	/**
	 * Stores ether statistics from the start of each day for calculating the percent change.
	 */
	private _day = this.createStore<EthereumPeriod>('periods/day', {
		id: '',
		priceBitcoin: 0,
		priceDollars: 0,
		updatedAt: 0
	});

	/**
	 * Stores ether statistics from the start of each week for calculating percent change.
	 */
	private _week = this.createStore<EthereumPeriod>('periods/week', {
		id: '',
		priceBitcoin: 0,
		priceDollars: 0,
		updatedAt: 0
	});

	/**
	 * The configuration file for ethereum tracking.
	 */
	public config = this.createConfig<EthereumConfig>({
		key: 'ETHERSCAN_KEY',
		timezone: 'America/Denver',
		accounts: [],
		announcements: [],
		emotes: {
			tickerDown: '',
			tickerUp: '',
			tickerNeutral: ''
		}
	});

	private _trackedChannels = new Set<TrackingChannel>();

	/**
	 * Starts the service.
	 */
	public async start() {
		this._trackedChannels = new Set();
		this.timezone = this.config.value.timezone;

		for (const target of this.config.value.announcements) {
			const channel = await this.bot.client.channels.fetch(target.channelId) as TextChannel;
			const users = new Array<TrackingChannelUser>();

			if (!channel) {
				throw new Error('Channel not found: ' + target.channelId);
			}

			for (const user of target.users) {
				const member = await channel.guild.members.fetch(user.userId);

				if (!member) {
					throw new Error(`User ${user.userId} not found in channel ${target.channelId}`);
				}

				users.push({
					member,
					sendPriceAlerts: user.sendPriceAlerts ?? false,
					updatePinImmediately: user.updatePinImmediately ?? false,
					updatePinInterval: user.updatePinInterval ?? 15
				});
			}

			const store = await this.createStoreAsync<TrackingChannelStore>(`pins/${target.channelId}`, {
				updatedAt: 0
			});

			const pin = store.value.messageId ? await channel.messages.fetch(store.value.messageId) : undefined;
			const tracking: TrackingChannel = {
				interval: 15,
				channel,
				users,
				pin,
				store,
				steps: 1
			};

			this._trackedChannels.add(tracking);

			if (pin === undefined) {
				await this._updatePinnedMessage(tracking, true);
			}
		}
	}

	@DiscordEvent('messageDelete')
	protected async onMessageDelete(message: Message) {
		for (const tracking of this._trackedChannels) {
			if (tracking.pin?.id === message.id) {
				await this._updatePinnedMessage(tracking);
			}
		}
	}

	@ServiceEvent(TrackingEvent.MemberStatusChanged)
	protected async onStatusChange(member: GuildMember, old?: Presence) {
		// Iterate over tracked channels
		for (const tracking of this._trackedChannels) {
			// Check if the member is being tracked for pinned message frequency
			const trackingMember = tracking.users.find(u => u.member.id === member.id);
			if (trackingMember) {
				// Recalculate the frequency lowest for the channel
				const frequency = Math.min(...tracking.users.map(user => {
					if (user.member.presence.status === 'online' || user.member.presence.status === 'dnd') {
						return user.updatePinInterval;
					}

					return 15;
				}), 15);

				// Update the frequency on the channel
				tracking.interval = Math.max(1, frequency);

				// Check if the current user is online
				if (member.presence.status === 'online' || member.presence.status === 'dnd') {
					// Check if they were previously offline
					if (old && (old.status === 'offline' || old.status === 'idle')) {
						// Are they a high priority (immediate) target?
						if (trackingMember.updatePinImmediately) {
							await this._updatePinnedMessage(tracking, true);
						}
					}
				}
			}
		}
	}

	/**
	 * Updates the pinned message for a channel.
	 *
	 * @param tracking
	 * @param force Force update the message and reset steps?
	 */
	private async _updatePinnedMessage(tracking: TrackingChannel, force = false) {
		const stats = this.getStats();
		const updateTime = moment.tz('America/Denver').format('h:mm A zz');

		const usd = this.getDollars(1, true);

		const change1h = this.getPercentLastHour();
		const change24h = this.getPercentLastDay();
		const change7d = this.getPercentLastWeek();

		const color = this.getTickerColor();
		const emote = this.getTickerEmote();

		const embed = new MessageEmbed({
			title: 'Ether ' + emote,
			color,
			fields: [
				{
					name: 'Current value',
					value: '$' + usd
				},

				{
					name: 'Last hour   󠀀󠀀',
					value: change1h,
					inline: true
				},
				{
					name: 'Today 󠀀󠀀   󠀀󠀀',
					value: change24h,
					inline: true
				},
				{
					name: 'This week',
					value: change7d,
					inline: true
				},
			],
			timestamp: Date.now()
		});

		if (!tracking.pin || tracking.pin.deleted || !tracking.pin.editable) {
			const message = await tracking.channel.send(embed);
			await message.pin();

			tracking.pin = message;
			tracking.store.value.messageId = message.id;
			tracking.store.value.updatedAt = stats.updatedAt;
			tracking.store.save();

			// Delete the pinned message
			const messages = await tracking.channel.messages.fetch({
				limit: 5
			});

			for (const message of messages.values()) {
				if (message.type === 'PINS_ADD') {
					await message.delete();
					break;
				}
			}

			this.logger.verbose('Created new pinned tracking message: %s', message.id);
		}

		else if ((force || tracking.steps >= tracking.interval)) {
			if (tracking.store.value.updatedAt !== stats.updatedAt) {
				await tracking.pin.edit(embed);
				tracking.store.value.updatedAt = stats.updatedAt;
				tracking.store.save();
			}

			tracking.steps = 1;
		}

		else {
			tracking.steps++;
		}
	}

	/**
	 * Updates the price of ethereum once per minute.
	 */
	@Task('0 * * * * *', { immediateFirstRun: true, immediateWhenLate: true })
	protected async updateEthereumPrices() {
		const key = this._getKey();
		const res = await fetch(`https://api.etherscan.io/api?module=stats&action=ethprice&apikey=${key}`);
		const data = (await res.json()).result;

		const updatedAt = this._stats.value?.updatedAt;
		const priceDollars = parseFloat(data.ethusd);
		const priceBitcoin = parseFloat(data.ethbtc);

		const stats = {
			priceDollars,
			priceBitcoin,
			updatedAt: parseInt(data.ethusd_timestamp) * 1000
		};

		// Update day and week if applicable
		this._updateDay(stats);
		this._updateWeek(stats);

		// Emit an event and save the statistics when the dollar value changes
		if (this._stats.value?.priceDollars !== priceDollars) {
			this._stats.write(stats);
			this.emit(EthereumEvent.DollarValueChanged, this.getStats());
		}

		// Record the statistics in the history store
		this._recordHistory(stats);

		// Update pinned messages
		if (this._stats.value?.updatedAt !== updatedAt) {
			for (const channel of this._trackedChannels) {
				await this._updatePinnedMessage(channel);
			}
		}
	}

	/**
	 * Announces daily earnings for tracked accounts.
	 *
	 * @param event
	 */
	@Task('0 0 0 * * *', { immediateWhenLate: true, numReattempts: 120 })
	protected async announceDailyEarnings(event: TaskEvent) {
		for (const account of this.getAccounts()) {
			const res = await fetch('https://eth.2miners.com/api/accounts/' + account.id);
			const data = await res.json() as TwoMinersResponse;
			const stats = this.getStats();

			// Get the earnings (and skip if zero)
			const sum = data.sumrewards.find(o => o.inverval === 86400);
			if (!sum || sum.reward === 0) continue;

			// Convert the earnings to usable data
			const eth = this.formatEther(sum.reward * 1e-9);
			const usd = this.formatDollars(stats.priceDollars * (sum.reward * 1e-9));

			// Get yesterday's date
			const date = moment.tz(event.currentInvokeTime, this.getTimezone()).subtract(1, 'h').format('dddd, MMMM Do YYYY');

			// Get the target channel
			const channel = await event.bot.client.channels.fetch(account.channelId) as TextChannel;
			if (!channel) throw new Error('Could not find channel for account: ' + account.id);

			// Get the target member
			const member = channel.guild.members.resolve(account.userId);
			if (!member) throw new Error('Could not find user for account: ' + account.id);

			// Send the message
			await channel.send(new MessageEmbed({
				author: {
					name: '2Miners',
					url: `https://eth.2miners.com/account/${account.id}`,
					icon_url: 'https://bailey.sh/bancho/icons/2miners.png?v=3'
				},
				description: `Here are ${member.displayName}'s earnings for ${date}.`,
				color: 0xff5500,
				fields: [
					{
						name: 'Ether',
						value: eth,
						inline: true
					},
					{
						name: 'Dollars',
						value: '$' + usd,
						inline: true
					},
				]
			}));
		}
	}

	/**
	 * Announces monthly earnings for tracked accounts.
	 *
	 * @param event
	 */
	@Task('0 0 0 1 * *', { immediateWhenLate: true, numReattempts: 120 })
	protected async announceMonthlyEarnings(event: TaskEvent) {
		for (const account of this.getAccounts()) {
			const res = await fetch('https://eth.2miners.com/api/accounts/' + account.id);
			const data = await res.json() as TwoMinersResponse;
			const stats = this.getStats();

			// Get the earnings (and skip if zero)
			const sum = data.sumrewards.find(o => o.inverval === 2592000);
			if (!sum || sum.reward === 0) continue;

			// Convert the earnings to usable data
			const eth = this.formatEther(sum.reward * 1e-9);
			const usd = this.formatDollars(stats.priceDollars * (sum.reward * 1e-9));

			// Get yesterday's date
			const date = moment.tz(event.currentInvokeTime, this.getTimezone()).subtract(1, 'h').format('MMMM YYYY');

			// Get the target channel
			const channel = await event.bot.client.channels.fetch(account.channelId) as TextChannel;
			if (!channel) throw new Error('Could not find channel for account: ' + account.id);

			// Get the target member
			const member = channel.guild.members.resolve(account.userId);
			if (!member) throw new Error('Could not find user for account: ' + account.id);

			// Send the message
			await channel.send(new MessageEmbed({
				author: {
					name: '2Miners',
					url: `https://eth.2miners.com/account/${account.id}`,
					icon_url: 'https://bailey.sh/bancho/icons/2miners-monthly.png?v=3'
				},
				description: `Here are ${member.displayName}'s earnings for the month of ${date}.`,
				color: 0x00b569,
				fields: [
					{
						name: 'Ether',
						value: eth,
						inline: true
					},
					{
						name: 'Dollars',
						value: '$' + usd,
						inline: true
					},
				]
			}));
		}
	}

	@Task('0 */5 * * * *', { immediateWhenLate: true })
	protected async announcePayouts(event: TaskEvent) {
		for (const account of this.getAccounts()) {
			const res = await fetch('https://eth.2miners.com/api/accounts/' + account.id);
			const data = await res.json() as TwoMinersResponse;
			const payment = data.payments[0];

			const store = await this.createStoreAsync<string | undefined>(
				`accounts/${account.id}/lastPaymentId`,
				payment?.tx
			);

			if (payment && store.value !== payment?.tx) {
				store.value = payment.tx;
				store.save();

				const stats = this.getStats();
				const eth = this.formatEther(payment.amount * 1e-9);
				const usd = this.formatDollars(stats.priceDollars * (payment.amount * 1e-9));

				this.logger.info(
					'New payout found for account %s worth %s ether or $%s',
					account.id,
					eth,
					usd
				);

				// Get the target channel
				const channel = await event.bot.client.channels.fetch(account.channelId) as TextChannel;
				if (!channel) throw new Error('Could not find channel for account: ' + account.id);

				// Get the target member
				const member = channel.guild.members.resolve(account.userId);
				if (!member) throw new Error('Could not find user for account: ' + account.id);

				// Send the message
				await channel.send(new MessageEmbed({
					author: {
						name: '2Miners',
						url: `https://eth.2miners.com/account/${account.id}`,
						icon_url: 'https://bailey.sh/bancho/icons/2miners-payout.png?v=3'
					},
					description: `${member} just received a new payout!`,
					color: 0x3498db,
					fields: [
						{
							name: 'Ether',
							value: eth,
							inline: true
						},
						{
							name: 'Dollars',
							value: '$' + usd,
							inline: true
						},
					]
				}));
			}
		}
	}

	/**
	 * Returns the dollar value of the given amount of ether.
	 *
	 * @param amount
	 */
	public getDollars(amount: number, format: true): string;
	public getDollars(amount: number): number;
	public getDollars(amount = 1, format = false): string | number {
		const dollars = this._stats.value?.priceDollars;

		if (dollars === undefined) {
			throw new Error('Data is currently unavailable');
		}

		const float = parseFloat((dollars * amount).toFixed(2));
		return format ? this.formatDollars(float) : float;
	}

	/**
	 * Returns the percentage of change for the last hour.
	 *
	 * @returns
	 */
	public getPercentLastHour() {
		const cutoff = Date.now() - 3600000;
		const firstIndex = this._history.value.findIndex(record => record.updatedAt >= cutoff);

		if (firstIndex < 0) {
			return 'Unavailable';
		}

		const now = this.getStats();
		const before = this._history.value[Math.max(0, firstIndex - 1)];
		const percent = 100 * ((now.priceDollars / before.priceDollars) - 1);

		return this.formatPercentage(percent);
	}

	/**
	 * Returns the percentage of change for the last day.
	 *
	 * @returns
	 */
	public getPercentLastDay() {
		if (this._day.value.id === '') {
			return 'Unavailable';
		}

		const now = this.getStats();
		const before = this._day.value;
		const percent = 100 * ((now.priceDollars / before.priceDollars) - 1);

		return this.formatPercentage(percent);
	}

	/**
	 * Returns the percentage of change for the last week.
	 *
	 * @returns
	 */
	public getPercentLastWeek() {
		if (this._week.value.id === '') {
			return 'Unavailable';
		}

		const now = this.getStats();
		const before = this._week.value;
		const percent = 100 * ((now.priceDollars / before.priceDollars) - 1);

		return this.formatPercentage(percent);
	}

	/**
	 * Returns the given dollars as a string with two decimals and commas.
	 *
	 * @param dollars
	 */
	public formatDollars(dollars: number) {
		return dollars.toLocaleString('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	/**
	 * Returns the given ether as a string with six decimals and commas.
	 *
	 * @param ether
	 */
	public formatEther(ether: number) {
		return ether.toLocaleString('en-US', {
			minimumFractionDigits: 6,
			maximumFractionDigits: 6
		});
	}

	/**
	 * Returns the given percentage as a string with a sign in front and the specified number of decimals.
	 *
	 * @param percent
	 * @param decimals Number to decimal places (defaults to `2`)
	 * @returns
	 */
	public formatPercentage(percent: string | number, decimals = 2) {
		const number = +percent;
		const sign = number > 0 ? '+' : '';

		return sign + number.toFixed(decimals) + '%';
	}

	/**
	 * Returns the current ethereum statistics.
	 * @returns
	 */
	public getStats() {
		if (this._stats.value === undefined) {
			throw new Error('Statistics are unavailable');
		}

		return this._stats.value;
	}

	/**
	 * Returns the etherscan.io key or throws an error if it's not configured.
	 *
	 * @returns
	 */
	private _getKey() {
		const key = this.config.value.key;

		if (key === 'ETHERSCAN_KEY' || typeof key !== 'string') {
			throw new Error('Please add an etherscan.io key to the config or disable the ethereum module!');
		}

		return key;
	}

	/**
	 * Adds statistics to the history store and cleans up old data.
	 *
	 * @param stats
	 */
	private _recordHistory(stats: EthereumStats) {
		this._history.value.push(stats);

		while (this._history.value.length > 125) {
			this._history.value.shift();
		}

		return this._history.save();
	}

	/**
	 * Updates the statistics for today if needed.
	 *
	 * @param stats
	 * @returns
	 */
	private async _updateDay(stats: EthereumStats) {
		const id = moment.tz(this.config.value.timezone).format('DD');

		// When the id no longer matches, we should update the day's stats
		if (this._day.value.id !== id) {
			this.logger.info('Starting the day with a value of $%s', this.formatDollars(stats.priceDollars));

			return this._day.write({
				id,
				...stats
			});
		}
	}

	/**
	 * Updates the statistics for this week if needed.
	 *
	 * @param stats
	 * @returns
	 */
	private async _updateWeek(stats: EthereumStats) {
		const id = moment.tz(this.config.value.timezone).format('ww');

		// When the id no longer matches, we should update the week's stats
		if (this._week.value.id !== id) {
			this.logger.info('Starting the week with a value of $%s', this.formatDollars(stats.priceDollars));

			return this._week.write({
				id,
				...stats
			});
		}
	}

	/**
	 * Returns the emote to use for the current trend.
	 *
	 * @param percent
	 * @returns
	 */
	public getTickerEmote(percent?: number) {
		const value = percent ?? parseFloat(this.getPercentLastDay());

		if (value < 0) {
			return this.config.value.emotes.tickerDown;
		}

		if (value > 0) {
			return this.config.value.emotes.tickerUp;
		}

		return this.config.value.emotes.tickerNeutral;
	}

	/**
	 * Returns the color to use for the current trend.
	 *
	 * @param percent
	 * @returns
	 */
	public getTickerColor(percent?: number) {
		const value = percent ?? parseFloat(this.getPercentLastDay());

		if (value < 0) {
			return 0xd13a3d;
		}

		if (value > 0) {
			return 0x75d180;
		}

		return 0xffffff;
	}

	/**
	 * Returns the tracked accounts in the service.
	 *
	 * @returns
	 */
	public getAccounts() {
		return this.config.value.accounts;
	}

	/**
	 * Returns the timezone to use.
	 *
	 * @returns
	 */
	public getTimezone() {
		return this.config.value.timezone;
	}

}

export interface EthereumConfig {
	/**
	 * Authentication key for etherscan.io.
	 */
	key: string;

	/**
	 * The timezone to use for calculations.
	 */
	timezone: string;

	/**
	 * Accounts to track and post updates for.
	 */
	accounts: EthereumAccount[];

	/**
	 * Channels to post announcements about price milestones in.
	 */
	announcements: {
		channelId: string;
		users: {
			userId: string;
			sendPriceAlerts?: boolean;
			updatePinInterval?: number;
			updatePinImmediately?: boolean;
		}[];
	}[];

	/**
	 * Emote strings to use for ethereum commands.
	 */
	emotes: {
		tickerDown: string;
		tickerUp: string;
		tickerNeutral: string;
	}
}

export interface EthereumAccount {
	id: string;
	channelId: string;
	userId: string;
}

interface EthereumStats {
	priceDollars: number;
	priceBitcoin: number;
	updatedAt: number;
}

interface EthereumPeriod extends EthereumStats {
	id: string;
}

interface TwoMinersResponse {
	'24hnumreward': number;
	'24hreward': number;
	currentHashrate: number;
	currentLuck: number;
	hashrate: number;
	minerCharts: {
		minerHash: number;
		minerLargeHash: number;
		timeFormat: string;
		workerOnline: number;
		x: number;
	}[];
	pageSize: number;
	payments: {
		amount: number;
		timestamp: number;
		tx: string;
	}[];
	paymentsTotal: number;
	rewards: {
		blockheight: number;
		timestamp: number;
		reward: number;
		percent: number;
		immature: boolean;
		orphan: boolean;
		uncle: boolean;
	}[];
	roundShares: number;
	stats: {
		balance: number;
		immature: number;
		lastShare: number;
		paid: number;
		pending: number;
	};
	sumrewards: {
		inverval: number;
		reward: number;
		numreward: number;
		name: 'Last 60 minutes' | 'Last 12 hours' | 'Last 24 hours' | 'Last 7 days' | 'Last 30 days';
		offset: number;
	}[];
	updatedAt: number;
	workers: {
		[name: string]: {
			lastBeat: number;
			hr: number;
			offline: boolean;
			hr2: number;
		}
	};
	workersOffline: number;
	workersOnline: number;
	workersTotal: number;
}

interface TrackingChannel {
	channel: TextChannel;
	pin?: Message;
	store: Store<TrackingChannelStore>;
	users: TrackingChannelUser[];
	interval: number;
	steps: number;
}

interface TrackingChannelUser {
	member: GuildMember;
	sendPriceAlerts: boolean;
	updatePinInterval: number;
	updatePinImmediately: boolean;
}

interface TrackingChannelStore {
	messageId?: string;
	updatedAt: number;
}
