import { Closure } from './types';

/**
 * This utility class allows you to create a `Promise` instance and then either resolve or reject it using the
 * `setResult()` and `setError()` methods.
 */
export class PromiseCompletionSource<T> {

	private _promise: Promise<T>;
	private _resolve: (value: T) => void;
	private _reject: (err?: any) => void;

	private _isFinished = false;
	private _isResolved = false;
	private _isRejected = false;

	/**
	 * Constructs a new `PromiseCompletionSource<T>` instance.
	 */
	public constructor() {
		this._resolve = () => {};
		this._reject = () => {};
		this._promise = new Promise((resolve, reject) => {
			this._resolve = resolve;
			this._reject = reject;
		});
	}

	/**
	 * The underlying promise that can be awaited.
	 */
	public get promise() {
		return this._promise;
	}

	/**
	 * Returns `true` when the promise source has either resolved or rejected.
	 */
	public get isFinished() {
		return this._isFinished;
	}

	/**
	 * Returns `true` if the promise resolved successfully.
	 */
	public get isResolved() {
		return this._isResolved;
	}

	/**
	 * Returns `true` if the promise rejected.
	 */
	public get isError() {
		return this._isRejected;
	}

	/**
	 * Resolves the promise with the provided value.
	 *
	 * @param value
	 */
	public setResult(value: T) {
		if (!this._isFinished) {
			this._isFinished = true;
			this._isResolved = true;

			this._resolve(value);
		}
	}

	/**
	 * Rejects the promise, optionally with the given error.
	 *
	 * @param err
	 */
	public setError(err?: any) {
		if (!this._isFinished) {
			this._isFinished = true;
			this._isRejected = true;

			this._reject(err);
		}
	}

}

/**
 * This utility class provides a simple interface for managing a delayed operation. It can provide a `promise` which
 * resolves after the timeout is invoked or cancelled.
 */
export class PromiseTimeoutSource {

	private _source: PromiseCompletionSource<boolean>;
	private _timeout: NodeJS.Timeout;

	private _isFinished = false;
	private _isCancelled = false;

	public constructor(public readonly milliseconds: number, public readonly closure: Closure) {
		this._source = new PromiseCompletionSource();
		this._timeout = setTimeout(() => this._execute(), milliseconds);
	}

	/**
	 * Internal executor for the timeout.
	 */
	private async _execute() {
		try {
			await Promise.resolve(this.closure());
			this._source.setResult(true);
		}
		catch (err) {
			this._source.setError(err);
		}
	}

	/**
	 * Cancels the timeout. The promise will resolve with `false`.
	 */
	public cancel() {
		if (!this._source.isFinished) {
			this._isCancelled = true;
			this._source.setResult(false);
			clearTimeout(this._timeout);
		}
	}

	/**
	 * Whether or not the timeout has finished or been cancelled.
	 */
	public get isFinished() {
		return this._isFinished;
	}

	/**
	 * Whether or not the timeout is still pending invocation.
	 */
	public get isPending() {
		return !this._isFinished;
	}

	/**
	 * Whether or not the timeout was cancelled before it executed.
	 */
	public get isCancelled() {
		return this._isCancelled;
	}

}
