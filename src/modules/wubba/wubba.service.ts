import { Service } from 'bancho';
import { MessageEmbed, TextChannel } from 'discord.js';
import { connect } from 'socket.io-client';
import { URL } from 'url';

export class WubbaService extends Service {

	public config = this.createConfig<WubbaConfig>({
		authentication: { url: '', token: '' },
		channels: [],
		emotes: {
			rickRoll: '🤣',
			rageQuit: '🤬'
		}
	});

	/**
	 * The socket connection.
	 */
	private _socket?: SocketIOClient.Socket;
	private _connectError?: string;

	/**
	 * Starts the connection to the Wubba API.
	 */
	public start() {
		if ((this.config.value.authentication.token === '')) {
			return this.logger.info('The service is not configured!');
		}

		this._connectError = undefined;
		this._socket = this.createSocket();
	}

	/**
	 * Stops the connection.
	 */
	public stop() {
		this._socket?.close();
	}

	/**
	 * Initializes a new socket instance.
	 *
	 * @returns
	 */
	protected createSocket() {
		const target = new URL(this.config.value.authentication.url);

		const socket = connect(target.origin, {
			transports: ['websocket'],
			path: target.pathname
		});

		this.authenticate(socket);
		this.listen(socket);

		return socket;
	}

	/**
	 * Handles authentication for the given socket after the API approves of the connection. Note that the token must
	 * have the `system:administrator` privilege for commands in the service to support user delegation.
	 *
	 * @param socket
	 */
	protected authenticate(socket: SocketIOClient.Socket) {
		socket.on('@authentication/init', () => {
			this.logger.debug('Sending authentication token...');

			socket.once('@authentication/result', (res: AuthDto) => {
				if (res.success) {
					this.logger.info('Authenticated as %s <%s>', res.userName, res.userId);
				}
				else {
					this.logger.error('Authentication failed:', res.message);
				}
			});

			socket.emit('@authentication/token', this.config.value.authentication.token);
		});

		// Handle connection errors
		socket.on('connect_error', (err: Error) => {
			if (this._connectError !== err.message) {
				this._connectError = err.message;

				this.logger.error('Failed to connect:', err.message);
				this.logger.error('The service will continue retrying (duplicate errors will be silenced)');
			}
		});

		// Print a notice when we connect
		socket.on('connect', () => {
			this.logger.debug('Connected, waiting for authentication...');
		});
	}

	/**
	 * Handles incoming data.
	 *
	 * @param socket
	 */
	protected listen(socket: SocketIOClient.Socket) {
		/**
		 * Handle new rick rolls!
		 */
		socket.on('event/rickRoll', async (location: RickRollDto) => {
			this.logger.info(
				'New rick roll from %s, %s, %s',
				location.city,
				location.regionName,
				location.country
			);

			for (const { channelId } of this.config.value.channels) {
				const channel = await this.bot.client.channels.fetch(channelId) as TextChannel;

				if (!(channel instanceof TextChannel)) {
					this.logger.error('Skipping invalid channel:', channelId);
					continue;
				}

				const area = location.country === 'United States' ? (location.city + ', ' + location.regionName) :
					(location.regionName + ', ' + location.country);

				const link = `https://tools.keycdn.com/geo?host=${location.ip}`;

				await channel.send(new MessageEmbed({
					description: `${this.config.value.emotes.rickRoll} **Rick rolled!** Someone from [${area}](${link}) just got pranked.`,
					color: 0x8b5f48
				}));
			}
		});

		/**
		 * Handle rage quit events.
		 */
		socket.on('event/rageQuit', async (dto: RageQuitDto) => {
			this.logger.info(
				'%s <%s> made %s <%s> rage quit!',
				dto.killer.username,
				dto.killer.id,
				dto.player.username,
				dto.player.id
			);

			for (const { channelId } of this.config.value.channels) {
				const channel = await this.bot.client.channels.fetch(channelId) as TextChannel;

				if (!(channel instanceof TextChannel)) {
					this.logger.error('Skipping invalid channel:', channelId);
					continue;
				}

				const victim = `[${dto.player.username}](https://steamcommunity.com/profiles/${dto.player.id64})`;

				await channel.send(new MessageEmbed({
					description: `${this.config.value.emotes.rageQuit} **Rage quit!** ${dto.killer.username} just made ${victim} leave their match.`,
					color: 0xda2f47
				}));
			}
		});

		/**
		 * Handle incoming chat trophies.
		 */
		socket.on('event/trophy', async (dto: TrophyDto) => {
			this.logger.info(
				'New chat trophy from %s <%s>',
				dto.player.username,
				dto.player.id
			);

			for (const { channelId } of this.config.value.channels) {
				const channel = await this.bot.client.channels.fetch(channelId) as TextChannel;

				if (!(channel instanceof TextChannel)) {
					this.logger.error('Skipping invalid channel:', channelId);
					continue;
				}

				await channel.send(new MessageEmbed({
					author: {
						name: dto.player.username,
						icon_url: dto.player.avatar,
						url: `https://steamcommunity.com/profiles/${dto.player.id64}`
					},
					description: `“${dto.message.trim()}”`,
					timestamp: dto.timestamp,
					color: 0xdac02f
				}));
			}
		});
	}

}

interface WubbaConfig {
	authentication: {
		url: string;
		token: string;
	};
	channels: WubbaChannel[];
	emotes: {
		rickRoll: string;
		rageQuit: string;
	};
}

interface WubbaChannel {
	channelId: string;
}

type AuthDto = SuccessAuthDto | FailedAuthDto;

interface SuccessAuthDto {
	success: true;
	userName: string;
	userId: string;
}

interface FailedAuthDto {
	success: false;
	message: string;
}

interface RickRollDto {
	status: 'success' | 'fail';
	ip: string;
	message?: string;
	country: string;
	regionName: string;
	city: string;
	continentCode: string;
}

interface RageQuitDto {
	player: PlayerModel;
	killer: PlayerModel;
	details: {
		weaponName: string;
		mapName: string;
		critical: boolean;
	}
}

interface TrophyDto {
	player: PlayerModel;
	message: string;
	timestamp: number;
}

interface PlayerModel {
	id: string;
	id64: string;
	username: string;
	avatar: string;
}
