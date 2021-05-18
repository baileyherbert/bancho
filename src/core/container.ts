import { Bridge } from './bot/bridge';
import { ReflectionClass } from './utilities/reflection/reflection.class';
import { Type } from './utilities/types';

/**
 * A basic dependency injection container which creates and stores singletons.
 */
export class Container {

	private _singletons = new Map<Type<any>, any>();

	/**
	 * Retrieves an instance of the specified type with dependencies automatically injected based on types registered
	 * in this container. The instance is cached internally and reused as a singleton.
	 *
	 * @param type
	 */
	public singleton<T>(type: Type<T>): T {
		// Return existing instance if possible
		if (this._singletons.has(type)) {
			return this._singletons.get(type)!;
		}

		const ref = new ReflectionClass(type);
		const paramTypes = ref.getMetadata<Type<any>[]>('design:paramtypes') ?? [];
		const params: any[] = [];

		Bridge.container = this;

		for (const paramType of paramTypes) {
			params.push(this.singleton(paramType));
		}

		const instance = new type(...params);
		this._singletons.set(type, instance);

		return instance;
	}

	/**
	 * Makes a new instance of the given type. This method ignores the local singleton cache and will always
	 * construct a new object. The new object is not cached and cannot be retrieved again by the container.
	 *
	 * @param type
	 * @returns
	 */
	public make<T>(type: Type<T>): T {
		const ref = new ReflectionClass(type);
		const paramTypes = ref.getMetadata<Type<any>[]>('design:paramtypes') ?? [];
		const params: any[] = [];

		Bridge.container = this;

		for (const paramType of paramTypes) {
			params.push(this.singleton(paramType));
		}

		const instance = new type(...params);

		return instance;
	}

	/**
	 * Registers the given object as a singleton instance in the container, making it available as a dependency for
	 * classes that need it.
	 *
	 * @param object
	 */
	public register(object: Object) {
		this._singletons.set(object.constructor as Type<any>, object);
	}

}

/**
 * Enables dependency injection on the target class. Without this decorator, a class can be created through a container
 * but will not have any dependencies injected automatically.
 *
 * @returns
 */
export function Injectable() {
	return function (constructor: Function) {
		Reflect.defineMetadata('bancho:injectable', true, constructor);
	}
}
