import { resolve } from './resolver';

export interface Resource<T, D extends {}> {
    resolve: Resolve<T, D>;
    finalize: (item: T) => Promise<void>;
}

export interface Definition {
    [key: string]: {
        dependencies: {
            [key: string]: any;
        };
        value: any;
    };
}

export type Injector<T extends { [key: string]: any }> = { [P in keyof T]: Promise<T[P]> };

export type Resolve<V, D extends {}> = (injector: Injector<D>) => Promise<V>;

export type PromisesHandler = (ps: Promise<void>[]) => Promise<void>;

type Resolvable<V, D extends {}> = (injector: Injector<D>) => V | Promise<V>;

const toResource = <V, D extends {}>(
    resolvable: Resolvable<V, D>,
    finalize: (instance: V) => Promise<void> = () => Promise.resolve(),
): Resource<V, D> => ({
    resolve: async (injector: Injector<D>): Promise<V> => resolvable(injector),
    finalize,
});

type ExactOneValue<T> = { [P in keyof T]: Exclude<T[keyof T], T[P]> extends never ? T[P] : never }[keyof T];
type DependentValue<T extends Definition, K> = ExactOneValue<{
    [P in keyof T]: K extends keyof T[P]['dependencies'] ? T[P]['dependencies'][K] : never;
}>;
type BoundKeys<T extends Definition> = Extract<{ [P in keyof T]: keyof T[P]['dependencies'] }[keyof T], keyof T>;
type MissingKeys<T extends Definition> = Exclude<{ [P in keyof T]: keyof T[P]['dependencies'] }[keyof T], keyof T>;
type MissingDependencies<T extends Definition> = { [P in MissingKeys<T>]: DependentValue<T, P> };

type ConflictedKeys<T extends Definition> = {
    [P in BoundKeys<T>]: T[P]['value'] extends DependentValue<T, P> ? never : P;
}[BoundKeys<T>];

type Requirements<T extends Definition> = MissingDependencies<T> & {
    // Prohibit from instantiation if required type conflicts.
    [P in ConflictedKeys<T>]: never;
};

export interface Result<T extends Definition> {
    container: Container<T>;
    finalize: (promisesHandler?: PromisesHandler) => Promise<void>;
}

export type Container<T extends Definition> = { [P in keyof T]: T[P]['value'] };

export type Underlying<T extends Definition> = { [P in keyof T]: Resource<T[P]['value'], T[P]['dependencies']> };

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
export class Design<T extends Definition> {
    private constructor(public readonly design: Underlying<T>) {}

    public bind = <K extends string, V, D extends {} = {}>(
        key: K,
        resolvable: Resolvable<V, Container<T> & D>,
        finalize: (item: V) => Promise<void> = () => Promise.resolve(),
    ): Design<T & { [key in K]: { dependencies: D; value: V } }> => {
        const underlying: Underlying<T & { [key in K]: { dependencies: D; value: V } }> = {
            ...this.design,
            [key]: toResource(resolvable, finalize),
        };
        return new Design(underlying);
    };

    public bindResource = <K extends string, V extends { finalize(): Promise<void> }, D extends {} = {}>(
        key: K,
        resolvable: Resolvable<V, Container<T> & D>,
    ): Design<T & { [key in K]: { dependencies: D; value: V } }> =>
        this.bind(key, resolvable, resource => resource.finalize());

    public merge = <U extends Definition>(that: Design<U>): Design<T & U> => {
        const underlying: Underlying<T & U> = {
            ...this.design,
            ...that.design,
        };
        return new Design(underlying);
    };

    public resolve = (requirements: Requirements<T>): Promise<Result<T>> =>
        resolve(this.merge(Design.pure(requirements)).design);

    public use =
        (requirements: Requirements<T>) =>
        async <A>(f: (container: Container<T>) => Promise<A>): Promise<A> => {
            const { container, finalize } = await this.resolve(requirements);
            try {
                const result = await f(container);
                return result;
            } finally {
                await finalize();
            }
        };

    public static pure = <U extends { [key: string]: any }>(
        mapping: U,
    ): Design<{ [P in keyof U]: { dependencies: {}; value: U[P] } }> => {
        const design: Underlying<{ [P in keyof U]: { dependencies: {}; value: U[P] } }> = {} as any;
        for (const key in mapping) {
            design[key] = {
                resolve: () => Promise.resolve(mapping[key]),
                finalize: () => Promise.resolve(),
            };
        }
        return new Design(design);
    };

    public static empty: Design<{}> = new Design({});

    public static bind = Design.empty.bind;
    public static bindResource = Design.empty.bindResource;
}
