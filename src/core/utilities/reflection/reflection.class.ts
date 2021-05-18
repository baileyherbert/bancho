import { Type } from '../types';
import { ReflectionMethod } from './reflection.method';

export class ReflectionClass<T> {

	private _constructor: Type<T>;
	private _parent?: ReflectionClass<any>;

	/**
	 * The type of the class in the form of a constructor function.
	 */
	public get type() {
		return this._constructor;
	}

	public constructor(constructor: Type<T>);
	public constructor(object: T);
	public constructor(object: any) {
		if (typeof object === 'object') object = object.constructor;
		else if (typeof object !== 'function') throw new Error('Expected function or object, got ' + typeof object);

		// Set the constructor
		this._constructor = object;

		// Load parent classes
		const parent = Object.getPrototypeOf(this._constructor.prototype);

		if (parent !== null && parent.constructor !== Object) {
			this._parent = new ReflectionClass<any>(parent);
		}
	}

	/**
	 * Returns the methods in this class.
	 *
	 * @returns
	 */
	public getMethods(filter?: MethodFilter): ReflectionMethod<T>[] {
		const methods = new Map<string, ReflectionMethod<T>>();

		// Add methods from the prototype
		for (const methodName of Object.getOwnPropertyNames(this._constructor.prototype)) {
			const proto = this._constructor.prototype[methodName];

			if (typeof proto === 'function') {
				const method = new ReflectionMethod<T>(this, methodName, this._constructor.prototype);
				methods.set(method.name, method);
			}
		}

		// Add methods from the class
		for (const methodName of Object.getOwnPropertyNames(this._constructor)) {
			// @ts-ignore
			const proto = this._constructor[methodName];

			if (typeof proto === 'function') {
				const method = new ReflectionMethod<T>(this, methodName, this._constructor);
				methods.set(method.name, method);
			}
		}

		// Add methods from the parent class
		if (this._parent !== undefined) {
			for (const method of this._parent.getMethods()) {
				if (!methods.has(method.name)) {
					methods.set(method.name, method);
				}
			}
		}

		// Filter
		if (filter !== undefined) {
			return [...methods.values()].filter(method => {
				let flags: MethodFilter = 0;

				// Static
				if (method.isStatic()) flags |= MethodFilter.Static;
				else flags |= MethodFilter.Local;

				// Typed
				if (method.isTyped()) flags |= MethodFilter.Typed;

				// Inheritance
				if (method.class === this) flags |= MethodFilter.Own;
				else flags |= MethodFilter.Inherited;

				return (flags & filter) > 0;
			});
		}

		return [...methods.values()];
	}

	/**
	 * Returns the method matching the given name. Throws an error if no match is found.
	 *
	 * @param name
	 * @returns
	 */
	public getMethod(name: string) {
		for (const method of this.getMethods()) {
			if (method.name === name) {
				return method;
			}
		}

		throw new Error(`No method named "${name}" was found in the class`);
	}

	/**
	 * Returns the `constructor` method for this class.
	 *
	 * @returns
	 */
	public getConstructor() {
		return this.getMethod('constructor');
	}

	/**
	 * Returns the value of the metadata under the specified key.
	 *
	 * @param name
	 * @returns
	 */
	public getMetadata<T = any>(name: string): T | undefined {
		return Reflect.getMetadata(name, this._constructor);
	}

	/**
	 * Sets the value of the metadata under the specified key.
	 *
	 * @param name
	 * @returns
	 */
	public setMetadata(name: string, value: any) {
		return Reflect.defineMetadata(name, value, this._constructor);
	}

	/**
	 * Returns `true` if there is metadata with the given name on this class.
	 *
	 * @param name
	 * @returns
	 */
	public hasMetadata(name: string) {
		return Reflect.hasMetadata(name, this._constructor);
	}

}

export enum MethodFilter {
	/**
	 * Filter methods that are static.
	 */
	Static = 1,

	/**
	 * Filter methods that are local (not static).
	 */
	Local = 2,

	/**
	 * Filter methods that have design type information available.
	 */
	Typed = 4,

	/**
	 * Filter methods that are inherited from parent classes.
	 */
	Inherited = 16,

	/**
	 * Filter methods that are not inherited from parent classes.
	 */
	Own = 32
}
