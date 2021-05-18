/**
 * Extracts the keys of object `T`, and falls back to a generic string type if undefined.
 */
export type Key<T> = T extends undefined ? string : Extract<keyof NonNullable<T>, string>;

/**
 * Extracts the value of index `K` from object `T`.
 *
 * - If object `T` is undefined, then `F` is returned.
 */
export type Value<T, K extends Key<T>, F = any> = T extends undefined ? F : NonNullable<T>[Exclude<K, string>];

/**
 * Extracts the value of index `K` from object `T`.
 *
 * - If object `T` is undefined, then `F` is returned.
 * - If `T[K]` is undefined, then `F` is returned.
 *
 * This is similar to `Value<T, K, F>` except it checks that the value of `T[K]` is set and allows you to fall back
 * to another value if not.
 */
export type Pull<T, K extends keyof NonNullable<T>, F = any> = T extends undefined ? F : (NonNullable<T>[K] extends undefined ? F : NonNullable<T>[K]);

/**
 * Returns `T` if defined, or `F` otherwise.
 */
export type Fallback<T, F> = T extends undefined ? F : NonNullable<T>;

/**
 * Join `Promise<T>` with `T` to mark it as optionally promisable.
 */
export type Promisable<T> = T | Promise<T>;

/**
 * Represents the constructor of the given class type.
 */
export type Type<T> = new (...args: any[]) => T;

export type Closure<T = any> = (...args: any[]) => T;
