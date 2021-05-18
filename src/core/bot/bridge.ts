import { Bot } from '../bot';
import { Container } from '../container';
import { BotModule } from './structures/botModule';

/**
 * Helper class that allows objects to retrieve temporary global variables at construction time.
 *
 * @internal
 */
export class Bridge {
	public static bot: Bot;
	public static container: Container;
	public static module: BotModule;
}
