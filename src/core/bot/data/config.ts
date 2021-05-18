import path from 'path';
import fs from 'fs';
import { Bot } from 'bancho/bot';
import { Logger } from '../logger';

export class Configuration<T> {

	protected logger: Logger;
	protected name: string;
	protected defaults: T;
	protected cache: T;

	public constructor(bot: Bot, configDir: string, name: string, defaults: T) {
		this.logger = bot.logger.createLogger('config');
		this.name = path.resolve(configDir, name.replace(/\.json$/, '') + '.json');
		this.defaults = defaults;
		this.cache = this._read();
	}

	/**
	 * The current value of the configuration file.
	 *
	 * @returns
	 */
	public get value() {
		return this.cache;
	}

	/**
	 * The absolute path to the configuration file.
	 */
	public get path() {
		return this.name;
	}

	/**
	 * Reads and returns the value of the configuration file, falling back to the defaults if not found.
	 *
	 * @returns
	 */
	private _read() {
		if (fs.existsSync(this.name)) {
			return JSON.parse(fs.readFileSync(this.name).toString()) ?? this.defaults;
		}
		else {
			const dirname = path.dirname(this.name);

			if (!fs.existsSync(dirname)) {
				fs.mkdirSync(dirname, { recursive: true });
			}

			fs.writeFileSync(this.name, JSON.stringify(this.defaults, null, '\t'));
		}

		return this.defaults;
	}

	/**
	 * Reads and returns the value of the configuration file, falling back to the defaults if not found.
	 *
	 * @returns
	 */
	private async _readAsync() {
		try {
			const value = (await fs.promises.readFile(this.name)).toString();
			return JSON.parse(value) ?? this.defaults;
		}
		catch (err) {
			return this.defaults;
		}
	}

	/**
	 * Asynchronously reloads value of the configuration file from the disk.
	 */
	public async reload() {
		this.cache = await this._readAsync();
	}

}
