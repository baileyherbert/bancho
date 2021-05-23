import { Service } from 'bancho';
import { TextChannel } from 'discord.js';
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

				await channel.send(`${this.config.value.emotes.rickRoll}  New rick roll from **${area}**!`);
			}
		});

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

				const killer = `[${dto.killer.username}](https://steamcommunity.com/profiles/${dto.killer.id64})`;
				const player = `[${dto.player.username}](https://steamcommunity.com/profiles/${dto.player.id64})`;

				await channel.send(`${this.config.value.emotes.rageQuit}  **${killer}** made **${player}** rage quit!`);
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
	message?: string;
	country: string;
	regionName: string;
	city: string;
	continentCode: string;
}

interface RageQuitDto {
	player: {
		id: string;
		id64: string;
		username: string;
	};
	killer: {
		id: string;
		id64: string;
		username: string;
	};
}
