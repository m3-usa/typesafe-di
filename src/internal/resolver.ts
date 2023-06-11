import { DAG } from './dag';
import { Container, Result, Definition, PromisesHandler, Underlying } from './design';

type Injector<T extends Definition> = { [P in keyof T]: Promise<Value<T, P>> };
type WrappedInjector<T extends Definition> = { [P in keyof T]: (dependedBy?: keyof T) => Promise<Value<T, P>> };
type Value<T extends Definition, K extends keyof T> = T[K]['value'];

const bindInjector = <T extends Definition>(wrapped: WrappedInjector<T>, dependedBy: keyof T): Injector<T> => {
    const injector: Injector<T> = {} as any;
    for (const key in wrapped) {
        Object.defineProperty(injector, key, {
            get: function () {
                return wrapped[key](dependedBy);
            },
        });
    }
    return injector;
};

const wrapResolve =
    <T extends Definition, K extends keyof T>(context: {
        underlying: Underlying<T>;
        dag: DAG<keyof T>;
        wrappedInjector: WrappedInjector<T>;
    }) =>
    (key: K) => {
        const { underlying, dag, wrappedInjector } = context;
        let resolved: Promise<Value<T, typeof key>>;
        return (dependedBy?: keyof T) => {
            if (typeof dependedBy === 'undefined') {
                dag.addNode(key);
            } else {
                dag.addEdge(dependedBy, key);
            }
            if (typeof resolved === 'undefined') {
                const injector = bindInjector(wrappedInjector, key);
                resolved = underlying[key].resolve(injector as any).catch(e => {
                    if (e.hasOwnProperty('__root_error__')) {
                        throw e;
                    } else {
                        const rootError = new Error(`failed to resolve "${key.toString()}" because: ${e.message}`);
                        Object.assign(rootError, { __root_error__: true });
                        throw rootError;
                    }
                });
            }
            return resolved;
        };
    };

const buildContainer = async <T extends Definition>(injector: WrappedInjector<T>): Promise<Container<T>> => {
    const container: Container<T> = {} as any;

    const promises: Promise<any>[] = [];
    for (const key in injector) {
        promises.push(
            injector[key]().then(value => {
                container[key] = value;
            }),
        );
    }
    await Promise.all(promises);
    return container;
};

const defaultPromisesHandler: PromisesHandler = async ps => {
    await Promise.all(ps);
};

const buildFinalize = <T extends Definition>(context: {
    container: Container<T>;
    dag: DAG<keyof T>;
    underlying: Underlying<T>;
}) => {
    let finalized = false;
    return async (promisesHandler: PromisesHandler = defaultPromisesHandler): Promise<void> => {
        if (finalized) {
            throw new Error('already finalized');
        }
        finalized = true;

        const { container, dag, underlying } = context;
        await dag.dependenciesForEachDepth().reduce(async (acc, keys) => {
            await acc;
            await promisesHandler(keys.map(key => underlying[key].finalize(container[key])));
        }, Promise.resolve());
    };
};

export async function resolve<T extends Definition>(underlying: Underlying<T>): Promise<Result<T>> {
    const dag = new DAG<keyof T>();
    const wrappedInjector: WrappedInjector<T> = {} as any;
    const resolveFor = wrapResolve({
        underlying,
        dag,
        wrappedInjector,
    });
    for (const key in underlying) {
        wrappedInjector[key] = resolveFor(key);
    }

    const container = await buildContainer(wrappedInjector);
    const finalize = buildFinalize({ container, dag, underlying });
    return { container, finalize };
}
