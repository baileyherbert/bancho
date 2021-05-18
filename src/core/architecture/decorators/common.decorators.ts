import { Key } from 'bancho/utilities/types';
import { ClientEvents } from 'discord.js';

/**
 * Declares a method as a Discord event handler. It will be invoked when the specified event occurs on the bot client.
 * You will need to look up the argument(s) provided by the event.
 *
 * @returns
 */
 export function DiscordEvent(event: BotEvent) {
	return function (_target: any, _property: string, descriptor: TypedPropertyDescriptor<any>) {
		Reflect.defineMetadata('bancho:handler:discord', event, descriptor.value);
	}
}

/**
 * Declares a method as a service event handler. It will be invoked when the specified event occurs on any service in
 * the bot. You will need to look up the argument(s) provided by the event.
 *
 * The `event` parameter should be a string from an enum provided by a module.
 *
 * @returns
 */
export function ServiceEvent(event: string) {
	return function (_target: any, _property: string, descriptor: TypedPropertyDescriptor<any>) {
		Reflect.defineMetadata('bancho:handler:service', event, descriptor.value);
	}
}

export type BotEvent = Key<ClientEvents>;
