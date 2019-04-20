import { resolve } from './resolver';

export interface Resource<T, D> {
    resolve: Resolve<T, D>;
    finalize: (item: T) => Promise<void>;
}

export interface Underlying {
    [key: string]: Resource<any, any>;
}

export type Injector<T extends { [key: string]: any }> = { [P in keyof T]: Promise<T[P]> };

export type Resolve<V, D> = (injector: Injector<D>) => Promise<V>;

export type PromisesHandler = (ps: Promise<void>[]) => Promise<void>;

type Merge<T, U> = { [P in Exclude<keyof T, keyof U>]: T[P] } & U;

type Resolvable<V, D> = (injector: Injector<D>) => V | Promise<V>;

const toResource = <V, D>(
    resolvable: Resolvable<V, D>,
    finalize: (instance: V) => Promise<void> = () => Promise.resolve(),
): Resource<V, D> => ({
    resolve: async (injector: Injector<D>): Promise<V> => resolvable(injector),
    finalize,
});

type Values<T> = T[keyof T];

type DependencyGraph<T> = { [P in keyof T]: T[P] extends Resource<any, infer D> ? D : never };

type DependentKeys<T> = Values<{ [P in keyof DependencyGraph<T>]: keyof DependencyGraph<T>[P] }>;

type ShouldResolve<T> = {
    [P in DependentKeys<T>]: Values<
        { [P2 in keyof DependencyGraph<T>]: P extends keyof DependencyGraph<T>[P2] ? DependencyGraph<T>[P2][P] : never }
    >
};

type ConflictedKeys<T> = Values<
    {
        [P in keyof ShouldResolve<T> & keyof T]: P extends keyof T
            ? (Container<T>[P] extends ShouldResolve<T>[P] ? never : P)
            : never
    }
>;

type Requirements<T> = { [P in Exclude<keyof ShouldResolve<T>, keyof T>]: ShouldResolve<T>[P] } &
    {
        // Prohibit from instantiating if required type conflicts.
        [P in ConflictedKeys<T>]: never
    };

interface Test {
    needsKey0: Resource<number, { key0: string }>;
    key0: Resource<number, {}>;
    needsKey1: Resource<number, { key1: string }>;
    key1: Resource<string, {}>;
    needsKey2: Resource<number, { key3: string }>;
}
type B = ConflictedKeys<Test>;
type A = Requirements<Test>;

export interface Result<T> {
    container: Container<T>;
    finalize: (promisesHandler?: PromisesHandler) => Promise<void>;
}

export type Container<T> = { [P in keyof T]: T[P] extends Resource<infer V, any> ? V : never };

/**
 * Design represents key-value styled dependency graph which can detect which dependent key is missing at compile time.
 *
 * i.g.)
 * ```
 * type HasNumber = { numberKey: number }
 *
 * // NOTE: `(injector: Injector<T>) => Promise<U>` represents dependencies for a value U.
 * // Injector<T> resolves value T[keyof T] by calling `injector.key()` asynchronously.
 * const detectStringFromNumber =
 *   async (injector: Injector<HasNumber>) => `number is ${await injector.numberKey}`;
 *
 * const design = Design.empty
 *   .bind('stringFromNumber', detectStringFromNumber);
 *
 * design.resolve({}) // compile error
 * design.resolve({ numberKey: 123 }) // returns Promise({ numberKey: 123, stringFromNumber: 'number is 123' })
 * ```
 *
 * see specs for more examples!
 *
 */
export class Design<T extends Underlying> {
    private constructor(public readonly design: T) {}

    public bind = <K extends string, V, D>(
        key: K,
        resolvable: Resolvable<V, D>,
        finalize: (item: V) => Promise<void> = () => Promise.resolve(),
    ): Design<T & { [key in K]: Resource<V, D> }> =>
        new Design({
            ...this.design,
            [key]: toResource(resolvable, finalize),
        });

    public merge = <U extends Underlying>(that: Design<U>): Design<T & U> =>
        new Design({
            ...this.design,
            ...that.design,
        });

    public resolve = (requirements: Requirements<T>): Promise<Result<T>> =>
        resolve(this.merge(Design.pure(requirements)).design);

    public static pure = <T extends { [key: string]: any }>(
        mapping: T,
    ): Design<{ [P in keyof T]: Resource<T[P], {}> }> => {
        const design: { [P in keyof T]: Resource<T[P], {}> } = {} as any;
        for (const key in mapping) {
            design[key] = {
                resolve: () => Promise.resolve(mapping[key]),
                finalize: () => Promise.resolve(),
            };
        }
        return new Design(design);
    };

    public static empty: Design<{}> = new Design({});
}
