import { DAG } from './dag';

describe('DAG', () => {
    describe('add', () => {
        it('fails when cyclic dependency detected', () => {
            const dag = new DAG<string>();
            dag.addEdge('1', '2');
            dag.addEdge('2', '3');
            dag.addEdge('3', '4');
            try {
                dag.addEdge('4', '1');
            } catch (e) {
                expect((e as Error).message).toEqual('cyclic dependency detected: 4 -> 1 -> 2 -> 3 -> 4');
            }
        });
    });

    describe('forEachFromLessDependencies', () => {
        it('resolves callback in appropriate order', async () => {
            const dag = new DAG<string>();
            dag.addEdge('a1', 'b');
            dag.addEdge('a2', 'b');
            dag.addEdge('b', 'c1');
            dag.addEdge('b', 'c2');

            const dependencies = dag.dependenciesForEachDepth();
            expect(dependencies).toEqual([['a1', 'a2'], ['b'], ['c1', 'c2']]);
        });
    });
});
