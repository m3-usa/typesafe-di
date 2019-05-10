import { Design, Injector } from './design';

describe('Design', () => {
    interface HasKey1 {
        key1: number;
    }
    interface HasKey2 {
        key2: string;
    }

    const resolveKey1 = async () => 123;
    const resolveKey2 = async (injector: Injector<HasKey1>) => injector.key1.then(n => `key1 is ${n}`);
    const resolveKey3 = async (injector: Injector<HasKey2>) => injector.key2.then(s => s === 'key1 is 123');

    describe('bind', () => {
        it('infers existing container type as injectoable by default', async () => {
            await Design.bind('key1', () => 123)
                .bind('key2', () => 'test')
                .bind('inferred', async injector => `${await injector.key1}-${await injector.key2}`)
                .resolve({});
        });

        it('takes explicit injector type parameter', async () => {
            await Design.bind('key1', () => 123)
                .bind('key2', () => 'test')
                .bind('explicit', async (injector: Injector<{ key0: number }>) => await injector.key0)
                .resolve({ key0: 0 });
        });
    });

    describe('resolve', () => {
        describe('with valid dependencies', () => {
            it('resolves design', async () => {
                const design = Design.bind('key1', resolveKey1).bind('key2', resolveKey2);
                const { container } = await design.resolve({});
                expect(container).toEqual({ key1: 123, key2: 'key1 is 123' });
            });

            describe('with merge', () => {
                it('resolves with merged design', async () => {
                    const design1 = Design.bind('key1', resolveKey1).bind('key2', resolveKey2);

                    const design2 = Design.bind('key3', resolveKey3);

                    const { container } = await design1.merge(design2).resolve({});
                    expect(container).toEqual({
                        key1: 123,
                        key2: 'key1 is 123',
                        key3: true,
                    });
                });
            });
        });

        it('resolves bound items exactly once', async () => {
            interface HasSideEffect {
                sideEffect: number;
            }
            let counter = 0;

            const design = Design.bind('sideEffect', () => {
                counter += 1;
                return 10;
            })
                .bind('dependent1', (injector: Injector<HasSideEffect>) =>
                    injector.sideEffect.then(num => `${num} from dependent1`),
                )
                .bind('dependent2', (injector: Injector<HasSideEffect>) =>
                    injector.sideEffect.then(num => `${num} from dependent2`),
                );
            const { container } = await design.resolve({});

            expect(counter).toEqual(1);
            expect(container).toEqual({
                sideEffect: 10,
                dependent1: '10 from dependent1',
                dependent2: '10 from dependent2',
            });
        });

        it('throws an error for self dependencies', async () => {
            const design = Design.bind('self', (r: Injector<{ self: number }>) => r.self);

            return design.resolve({}).then(
                () => {
                    throw new Error('should fail');
                },
                (e: Error) => {
                    expect(e.message).toEqual(
                        'failed to resolve "self" because: cyclic dependency detected: self -> self',
                    );
                },
            );
        });

        it('throws an error for cyclic dependencies', async () => {
            interface HasKey1 {
                key1: number;
            }
            interface HasKey2 {
                key2: number;
            }
            const design = Design.bind('key1', (r: Injector<HasKey2>) => r.key2).bind(
                'key2',
                (r: Injector<HasKey1>) => r.key1,
            );

            return design.resolve({}).then(
                () => {
                    throw new Error('should fail');
                },
                (e: Error) => {
                    expect(e.message).toEqual(
                        'failed to resolve "key2" because: cyclic dependency detected: key2 -> key1 -> key2',
                    );
                },
            );
        });

        it('can finalize according to the dependent order', async () => {
            const called: string[] = [];
            const callWith = <T>(key: string, value: T) => async (item: T) => {
                expect(item).toEqual(value);
                called.push(key);
            };

            const design = Design.bind('key1', resolveKey1, callWith('key1', 123))
                .bind('key2', resolveKey2, callWith('key2', 'key1 is 123'))
                .bind('key3', resolveKey3, callWith('key3', true as boolean));
            const { finalize } = await design.resolve({});
            await finalize();

            expect(called).toEqual(['key3', 'key2', 'key1']);
        });

        it('cannot call finalize twice', async () => {
            const { finalize } = await Design.empty.resolve({});
            await finalize();
            finalize().then(
                () => {
                    throw new Error('should fail');
                },
                e => expect(e.message).toEqual('already finalized'),
            );
        });

        it('can use own error handler', async () => {
            const { finalize } = await Design.bind(
                'key1',
                () => 123,
                async () => {
                    throw new Error('fails');
                },
            ).resolve({});
            await finalize(async ps => {
                try {
                    await Promise.all(ps);
                } catch (e) {
                    expect(e.message).toEqual('fails');
                }
            });
        });
    });
});
