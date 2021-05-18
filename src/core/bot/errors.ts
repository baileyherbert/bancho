/**
 * Base class for all expected bot errors.
 */
export class BotError extends Error {
	public constructor(message?: string) {
		super(message);
		this.name = this.constructor.name;
	}
}

/**
 * Thrown when the bot or one of its components fail to start due to an error.
 */
export class StartError extends BotError {

}

/**
 * Thrown by commands when an error occurs that should be caught and whose message should be shown to the user.
 */
export class UserError extends BotError {

}

/**
 * Thrown by commands when an invalid argument is received. These errors are caught by the framework and their
 * messages are displayed to the user as feedback.
 */
export class InvalidArgumentError extends UserError {

}

/**
 * Thrown by tasks for expected errors. When this error is thrown by a task, it will be caught, details will be logged
 * to the verbose output, and the task will be retried.
 */
export class TaskError extends BotError {

	public constructor(message: string, public readonly realError?: Error) {
		super(message);
	}

}
