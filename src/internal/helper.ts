type OptionalKeys<T> = { [K in keyof T]: T[K] extends Required<T>[K] ? never : K }[keyof T];
type InjectorFor<T, K extends keyof T> = Exclude<keyof T, K | OptionalKeys<T>> extends never
    ? { [P in K]: Promise<T[P]> }
    : never;

async function pick<T, K extends keyof T>(
    injector: { [P in K]: Promise<T[P]> },
    keys: K[],
): Promise<Readonly<{ [P in K]: T[P] }>> {
    return Object.fromEntries(await Promise.all(keys.map(async name => [name, await injector[name]])));
}

export const inject = <T, K extends keyof T, V>(f: (params: { [P in K]: T[P] }) => V | Promise<V>, keys: K[]) => async (
    injector: InjectorFor<T, K>,
): Promise<V> => {
    const params = await pick(injector, keys);
    return f(params);
};

export const injectClass = <T, K extends keyof T, V>(Class: new (params: { [P in K]: T[P] }) => V, keys: K[]) =>
    inject((params: { [P in K]: T[P] }) => new Class(params), keys);
