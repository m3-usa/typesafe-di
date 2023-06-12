/**
 * DAG representing dependencies.
 * For example, this mapping means item1 depends on item2 and item3.
 * { item1: Set(item2, item3) }
 */
export class DAG<T> {
    private map: Map<T, Set<T>> = new Map();

    public addNode = (node: T) => {
        this.ensureNode(node);
    };

    public addEdge = (from: T, to: T) => {
        this.ensureNode(to);

        const dependencies = this.ensureNode(from);
        dependencies.add(to);

        const cycle = this.detectCyclicDependency(from);
        if (typeof cycle !== 'undefined') {
            throw new Error(`cyclic dependency detected: ${cycle.join(' -> ')}`);
        }
    };

    /**
     * Returns Ts for each depdnent level from less dependents to more dependents.
     * i.g.)
     * - A1 depends on B
     * - A2 depends on B
     * - B depends on C1
     * - B depends on C2
     * => [
     *   [A1, A2],
     *   [B],
     *   [C1, C2]
     * ]
     */
    public dependenciesForEachDepth = (): T[][] => {
        const go = (dependencies: Map<T, Set<T>>, result: T[][]): T[][] => {
            const independentKeys = Array.from(dependencies)
                .filter(([, set]) => set.size === 0)
                .map(([key]) => key);
            independentKeys.forEach(independentKey => {
                dependencies.delete(independentKey);
                Array.from(dependencies).forEach(([, set]) => set.delete(independentKey));
            });

            const next = [independentKeys, ...result];
            return dependencies.size === 0 ? next : go(dependencies, next);
        };

        const clone = Array.from(this.map).reduce(
            (acc, [key, dependencies]) => acc.set(key, new Set(dependencies)),
            new Map<T, Set<T>>(),
        );
        return go(clone, []);
    };

    private ensureNode = (node: T): Set<T> => {
        const set = this.map.get(node) || new Set<T>();
        this.map.set(node, set);
        return set;
    };

    private detectCyclicDependency = (from: T): T[] | undefined => {
        const go = (current: Set<T>, dependencies: T[]): T[] | undefined => {
            if (dependencies.length === 0) {
                return;
            }

            return Array.from(current)
                .map(node => {
                    const ds = [...dependencies, node];
                    const cycleDetected = node === from;
                    return cycleDetected ? ds : go(this.map.get(node) || new Set(), ds);
                })
                .find(res => typeof res !== 'undefined');
        };
        return go(this.map.get(from) || new Set(), [from]);
    };
}
