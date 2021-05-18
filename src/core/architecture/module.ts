import { Type } from '../utilities/types';
import { Controller } from './controller';
import { Service } from './service';

export function Module(options: ModuleOptions) {
	return function (constructor: Function) {
		Reflect.defineMetadata('bancho:module', options, constructor);
	}
}

export interface ModuleOptions {
	/**
	 * The name of the module for logging.
	 */
	name: string;

	/**
	 * An array containing the constructors of all controller classes in this module.
	 */
	controllers?: Type<Controller>[];

	/**
	 * An array containing the constructors of all service classes in this module.
	 */
	services?: Type<Service>[];
}
