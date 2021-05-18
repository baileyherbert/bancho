import path from 'path';
import fs from 'fs';
import { PromiseCompletionSource } from 'bancho/utilities/promises';
import { Bot } from 'bancho/bot';
import { Logger } from '../logger';

export class Store<T = any> {

	protected logger: Logger;
	protected name: string;
	protected defaults: T;
	protected cache: T;

	private _writePromiseSource?: PromiseCompletionSource<void>;
	private _pendingWritePromiseSource?: PromiseCompletionSource<void>;

	public constructor(bot: Bot, storageDir: string, name: string, defaults: T, preloaded?: boolean, preloadedCache?: T) {
		this.logger = bot.logger.createLogger('store');
		this.name = path.resolve(storageDir, name.replace(/\.json$/, '') + '.json');
		this.defaults = defaults;
		this.cache = preloaded ? preloadedCache! : defaults;

		if (!preloaded) {
			// Restore progress from journal file if applicable
			this._restoreFromJournal();

			// Create the default file if it doesn't exist
			if (!fs.existsSync(this.name)) {
				this._ensureDirectory();

				if (defaults !== undefined) {
					const data = JSON.stringify(defaults, null, '\t');
					const journal = this.name + '-journal';

					fs.writeFileSync(journal, data);
					fs.writeFileSync(this.name, data);
					fs.unlinkSync(journal);
				}
			}

			// Load the value of the store
			if (fs.existsSync(this.name)) {
				const content = fs.readFileSync(this.name).toString();
				const [success, data] = Store._parseJsonData(content);

				// Load the value if successful
				if (success) {
					this.cache = data;
				}

				// Otherwise log an error and use the default value
				else {
					this.logger.warn('Failed to load corrupted store: %s (using defaults instead)', this.name);
				}
			}
		}
	}

	/**
	 * The absolute path to the store file.
	 */
	public get path() {
		return this.name;
	}

	/**
	 * The current value of the store.
	 */
	public get value() {
		return this.cache;
	}

	/**
	 * Sets the current value of the store.
	 */
	public set value(value: T) {
		this.cache = value;
	}

	/**
	 * Sets the value of the store to the given value and saves it.
	 *
	 * @param value
	 */
	public write(value: T) {
		this.cache = value;
		return this.save();
	}

	/**
	 * Asynchronously saves the store to the disk.
	 */
	public save() {
		// Start writing immediately if there isn't an operation in progress
		if (!this._writePromiseSource) {
			this._writePromiseSource = new PromiseCompletionSource();
			this._write();

			return this._writePromiseSource.promise;
		}

		// Otherwise schedule a write operation if not already done
		// If another write operation is already scheduled, we can just return its promise directly
		// The scheduled operation will still capture the data we want to save right now
		else if (!this._pendingWritePromiseSource) {
			this._pendingWritePromiseSource = new PromiseCompletionSource();
		}

		return this._pendingWritePromiseSource.promise;
	}

	/**
	 * Writes changes to the store.
	 *
	 * @param data
	 */
	private async _write() {
		try {
			const data = JSON.stringify(this.cache, null, '\t');
			const journal = await fs.promises.open(this.name + '-journal', 'w');
			const file = await fs.promises.open(this.name, 'w');

			await journal.write(data.substring(0, data.length - 1));
			await journal.close();

			await file.write(data);
			await file.close();

			await fs.promises.unlink(this.name + '-journal');
		}
		catch (error) {
			this.logger.error('Failed to save store file at %s:', this.name, error);
		}

		// Resolve and clear the active write promise
		this._writePromiseSource?.setResult();
		this._writePromiseSource = undefined;

		// Start the next scheduled write if available
		if (this._pendingWritePromiseSource) {
			this._writePromiseSource = this._pendingWritePromiseSource;
			this._pendingWritePromiseSource = undefined;
			this._write();
		}
	}

	/**
	 * Recovers from an interrupted write operation using a journal file, if applicable.
	 */
	private _restoreFromJournal() {
		const journalFileName = this.name + '-journal';

		// Check for the journal file
		// When a file is found at this path, it means a write operation did not complete cleanly
		if (fs.existsSync(journalFileName)) {
			// Load the contents of the journal
			const content = fs.readFileSync(journalFileName).toString();

			// Parse the journal
			const [success] = Store._parseJsonData(content);

			this.logger.info('Recovering from an incomplete write operation at:', this.name);

			// When parsing is successful, the journal is valid and the store file is likely corrupt
			// In this case we should finish applying the journal to the store file
			if (success) {
				fs.writeFileSync(this.name, content);
				this.logger.info('The pending write was recovered successfully');
			}

			// When parsing fails, log an error to indicate that the write operation was lost
			else {
				this.logger.warn('The pending write is corrupt and has been ignored (the original data is still safe)');
			}

			// Remove the journal file
			fs.unlinkSync(journalFileName);
		}
	}

	/**
	 * Parses the given string as JSON with error handling.
	 *
	 * @param content
	 * @returns
	 */
	private static _parseJsonData(content: string): [success: boolean, data: any] {
		try {
			const data = JSON.parse(content);
			return [true, data];
		}
		catch (err) {
			return [false, null];
		}
	}

	/**
	 * Ensures the directory of the store exists.
	 */
	private _ensureDirectory() {
		const dirname = path.dirname(this.name);

		if (!fs.existsSync(dirname)) {
			fs.mkdirSync(dirname, { recursive: true });
		}
	}

	/**
	 * Asynchronously creates and returns a store with all loading operations using asynchronous, non-blocking file
	 * operations.
	 *
	 * @param bot
	 * @param storageDir
	 * @param name
	 * @param defaults
	 * @returns
	 */
	public static async createAsync<T>(bot: Bot, storageDir: string, name: string, defaults: T) {
		const fileName = path.resolve(storageDir, name.replace(/\.json$/, '') + '.json');
		const logger = bot.logger.createLogger('store:async');
		let cache: T = defaults;

		await this._restoreFromJournalAsync(logger, fileName);

		// Create the default file if it doesn't exist
		if (!(await this._getFileExists(fileName))) {
			const dirName = path.dirname(fileName);

			if (!(await this._getFileExists(dirName))) {
				await fs.promises.mkdir(dirName, { recursive: true });
			}

			if (defaults !== undefined) {
				const data = JSON.stringify(defaults, null, '\t');
				const journal = fileName + '-journal';

				await fs.promises.writeFile(journal, data);
				await fs.promises.writeFile(fileName, data);
				await fs.promises.unlink(journal);
			}
		}

		// Load the value of the store
		if (await this._getFileExists(fileName)) {
			const content = (await fs.promises.readFile(fileName)).toString();
			const [success, data] = Store._parseJsonData(content);

			// Load the value if successful
			if (success) {
				cache = data;
			}

			// Otherwise log an error and use the default value
			else {
				logger.warn('Failed to load corrupted store: %s (using defaults instead)', fileName);
			}
		}

		return new Store<T>(bot, storageDir, name, defaults, true, cache);
	}

	/**
	 * Asynchronously restores data from a journal.
	 *
	 * @param logger
	 * @param fileName
	 */
	private static async _restoreFromJournalAsync(logger: Logger, fileName: string) {
		const journalFileName = fileName + '-journal';

		// Check for the journal file
		// When a file is found at this path, it means a write operation did not complete cleanly
		if (await this._getFileExists(journalFileName)) {
			// Load the contents of the journal
			const content = (await fs.promises.readFile(journalFileName)).toString();

			// Parse the journal
			const [success] = this._parseJsonData(content);

			logger.info('Recovering from an incomplete write operation at:', fileName);

			// When parsing is successful, the journal is valid and the store file is likely corrupt
			// In this case we should finish applying the journal to the store file
			if (success) {
				await fs.promises.writeFile(fileName, content);
				logger.info('The pending write was recovered successfully');
			}

			// When parsing fails, log an error to indicate that the write operation was lost
			else {
				logger.warn('The pending write is corrupt and has been ignored (the original data is still safe)');
			}

			// Remove the journal file
			await fs.promises.unlink(journalFileName);
		}
	}

	/**
	 * Returns `true` if the given path exists.
	 *
	 * @param path
	 */
	private static async _getFileExists(path: string) {
		try {
			await fs.promises.stat(path);
			return true;
		}
		catch (error) {
			if (error.code === 'ENOENT') {
				return false;
			}

			throw error;
		}
	}

}
