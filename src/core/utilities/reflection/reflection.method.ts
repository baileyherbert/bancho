import { ReflectionClass } from './reflection.class';

const STRIP_COMMENTS = /(\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\s*=[^,\)]*(('(?:\\'|[^'\r\n])*')|("(?:\\"|[^"\r\n])*"))|(\s*=[^,\)]*))/mg;
const ARGUMENT_NAMES = /([^\s,]+)/g;

export class ReflectionMethod<T> {

	/**
	 * The name of the method.
	 */
	public readonly name: string;

	/**
	 * The class this method belongs to.
	 */
	public readonly class: ReflectionClass<T>;

	/**
	 * The prototype that this method lives in.
	 */
	private _proto: any;

	private _designType?: any;
	private _designParamTypes?: any;
	private _designReturnType?: any;

	public constructor(parent: ReflectionClass<T>, name: string, proto: any) {
		this.name = name;
		this.class = parent;
		this._proto = proto;

		this._designType = Reflect.getMetadata('design:type', proto, name);
		this._designParamTypes = Reflect.getMetadata('design:paramtypes', proto, name);
		this._designReturnType = Reflect.getMetadata('design:returntype', proto, name);
	}

	/**
	 * Returns the prototype function for this method.
	 *
	 * @returns
	 */
	public getFunction(): Function {
		return this._proto[this.name];
	}

	/**
	 * Returns a function that can be invoked to call the method.
	 *
	 * For static methods, no arguments should be supplied. For local methods, you must provide an instance of the
	 * parent class to invoke the method on.
	 *
	 * @param object
	 * @returns
	 */
	public getClosure(object?: T | null): (...args: any[]) => any {
		if (this.isStatic()) {
			if (object !== undefined && object !== null) {
				throw new Error('Cannot call static method on an object');
			}

			return (...args: any[]) => this._proto[this.name](...args);
		}

		if (object === undefined || object === null) {
			throw new Error('Cannot call local method without specifying a target object');
		}

		if (!(object instanceof this.class.type)) {
			throw new Error('Attempt to call local method on an object from a different type');
		}

		// @ts-ignore
		return (...args: any[]) => object[this.name](...args);
	}

	/**
	 * Invokes the method.
	 *
	 * For static methods, the `object` argument should not be supplied. For local methods, you must provide an
	 * instance of the parent class to invoke the method on.
	 *
	 * @param object
	 * @param args
	 * @returns
	 */
	public invoke(object?: T | null, ...args: any[]) {
		const closure = this.getClosure(object);
		return closure(...args);
	}

	/**
	 * Returns `true` if this method is the class constructor.
	 *
	 * @returns
	 */
	public isConstructor() {
		return this.name === 'constructor';
	}

	/**
	 * Returns `true` if this method is static.
	 *
	 * @returns
	 */
	public isStatic() {
		// @ts-ignore
		return typeof this.class.type[this.name] === 'function' && !this.isConstructor();
	}

	/**
	 * Returns `true` if design type information is available for this method.
	 *
	 * TypeScript will not output design information, such as parameter and return types, unless the method has at
	 * least one decorator applied.
	 */
	public isTyped() {
		return this._designType !== undefined;
	}

	/**
	 * Returns the type that the method can return. This will not be a reflected object but instead a generic object
	 * like `Function` or `Object`.
	 *
	 * @returns
	 */
	public getReturnType() {
		return this._designReturnType;
	}

	/**
	 * Returns the parameters for this method.
	 */
	public getParameters() {
		const func = this.getFunction();
		const fnStr = func.toString().replace(STRIP_COMMENTS, '');
		const names = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES) ?? [];
		const params = new Array<ReflectionParameter>();
		let index = 0;

		if (this.isTyped()) {
			for (const type of this._designParamTypes) {
				params.push({
					name: names[index] ?? '',
					position: index++,
					type
				});
			}
		}

		else {
			for (const name of names) {
				params.push({
					name: name,
					position: index++,
					type: undefined
				});
			}
		}

		return params;
	}

	/**
	 * Returns the value of the metadata under the specified key.
	 *
	 * @param name
	 * @returns
	 */
	public getMetadata<T = any>(name: string): T | undefined {
		return Reflect.getMetadata(name, this.getFunction());
	}

	/**
	 * Sets the value of the metadata under the specified key.
	 *
	 * @param name
	 * @returns
	 */
	public setMetadata(name: string, value: any) {
		return Reflect.defineMetadata(name, value, this.getFunction());
	}

	/**
	 * Returns `true` if there is metadata with the given name on this method.
	 *
	 * @param name
	 * @returns
	 */
	public hasMetadata(name: string) {
		return Reflect.hasMetadata(name, this.getFunction());
	}

}

export interface ReflectionParameter {
	position: number;
	name: string;
	type?: Function;
}
