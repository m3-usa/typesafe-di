import { Design, Injector } from './design';
import { injectClass } from './helper';

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

    describe('pure', () => {
        it('enables us to reuse resolved container', async () => {
            const { container } = await Design.bind('key1', () => 123).resolve({});
            const { container: scoped } = await Design.pure(container)
                .bind('key2', async injector => (await injector.key1) * 2)
                .resolve({});
            expect(scoped.key2).toBe(246);
        });
    });

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

    describe('bindResource', () => {
        it('registers finalize as finalizer', async () => {
            let finalized = false;
            class Resource {
                public async finalize(): Promise<void> {
                    finalized = true;
                }
            }
            const {
                container: { resource },
                finalize,
            } = await Design.bindResource('resource', injectClass(Resource, [])).resolve({});
            expect(resource instanceof Resource).toBe(true);
            expect(finalized).toBe(false);

            await finalize();

            expect(finalized).toBe(true);
        });

        class NotResource {}
        // @ts-expect-error Should not be assignable to Resource
        Design.bindResource('notResource', injectClass(NotResource, []));
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
            const callWith =
                <T>(key: string, value: T) =>
                async (item: T) => {
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
                    expect((e as Error).message).toEqual('fails');
                }
            });
        });
    });

    describe('with long dependencies', () => {
        const design = Design.bind('dep1', async () => 1)
            .bind('dep2', async injector => 1 + (await injector.dep1))
            .bind('dep3', async injector => 1 + (await injector.dep2))
            .bind('dep4', async injector => 1 + (await injector.dep3))
            .bind('dep5', async injector => 1 + (await injector.dep4))
            .bind('dep6', async injector => 1 + (await injector.dep5))
            .bind('dep7', async injector => 1 + (await injector.dep6))
            .bind('dep8', async injector => 1 + (await injector.dep7))
            .bind('dep9', async injector => 1 + (await injector.dep8))
            .bind('dep10', async injector => 1 + (await injector.dep9))
            .bind('dep11', async injector => 1 + (await injector.dep10))
            .bind('dep12', async injector => 1 + (await injector.dep11))
            .bind('dep13', async injector => 1 + (await injector.dep12))
            .bind('dep14', async injector => 1 + (await injector.dep13))
            .bind('dep15', async injector => 1 + (await injector.dep14))
            .bind('dep16', async injector => 1 + (await injector.dep15))
            .bind('dep17', async injector => 1 + (await injector.dep16))
            .bind('dep18', async injector => 1 + (await injector.dep17))
            .bind('dep19', async injector => 1 + (await injector.dep18))
            .bind('dep20', async injector => 1 + (await injector.dep19))
            .bind('dep21', async injector => 1 + (await injector.dep20))
            .bind('dep22', async injector => 1 + (await injector.dep21))
            .bind('dep23', async injector => 1 + (await injector.dep22))
            .bind('dep24', async injector => 1 + (await injector.dep23))
            .bind('dep25', async injector => 1 + (await injector.dep24))
            .bind('dep26', async injector => 1 + (await injector.dep25))
            .bind('dep27', async injector => 1 + (await injector.dep26))
            .bind('dep28', async injector => 1 + (await injector.dep27))
            .bind('dep29', async injector => 1 + (await injector.dep28))
            .bind('dep30', async injector => 1 + (await injector.dep29))
            .bind('dep31', async injector => 1 + (await injector.dep30))
            .bind('dep32', async injector => 1 + (await injector.dep31))
            .bind('dep33', async injector => 1 + (await injector.dep32))
            .bind('dep34', async injector => 1 + (await injector.dep33))
            .bind('dep35', async injector => 1 + (await injector.dep34))
            .bind('dep36', async injector => 1 + (await injector.dep35))
            .bind('dep37', async injector => 1 + (await injector.dep36))
            .bind('dep38', async injector => 1 + (await injector.dep37))
            .bind('dep39', async injector => 1 + (await injector.dep38))
            .bind('dep40', async injector => 1 + (await injector.dep39))
            .bind('dep41', async injector => 1 + (await injector.dep40))
            .bind('dep42', async injector => 1 + (await injector.dep41))
            .bind('dep43', async injector => 1 + (await injector.dep42))
            .bind('dep44', async injector => 1 + (await injector.dep43))
            .bind('dep45', async injector => 1 + (await injector.dep44))
            .bind('dep46', async injector => 1 + (await injector.dep45))
            .bind('dep47', async injector => 1 + (await injector.dep46))
            .bind('dep48', async injector => 1 + (await injector.dep47))
            .bind('dep49', async injector => 1 + (await injector.dep48))
            .bind('dep50', async injector => 1 + (await injector.dep49))
            .bind('dep51', async injector => 1 + (await injector.dep50))
            .bind('dep52', async injector => 1 + (await injector.dep51))
            .bind('dep53', async injector => 1 + (await injector.dep52))
            .bind('dep54', async injector => 1 + (await injector.dep53))
            .bind('dep55', async injector => 1 + (await injector.dep54))
            .bind('dep56', async injector => 1 + (await injector.dep55))
            .bind('dep57', async injector => 1 + (await injector.dep56))
            .bind('dep58', async injector => 1 + (await injector.dep57))
            .bind('dep59', async injector => 1 + (await injector.dep58))
            .bind('dep60', async injector => 1 + (await injector.dep59))
            .bind('dep61', async injector => 1 + (await injector.dep60))
            .bind('dep62', async injector => 1 + (await injector.dep61))
            .bind('dep63', async injector => 1 + (await injector.dep62))
            .bind('dep64', async injector => 1 + (await injector.dep63))
            .bind('dep65', async injector => 1 + (await injector.dep64))
            .bind('dep66', async injector => 1 + (await injector.dep65))
            .bind('dep67', async injector => 1 + (await injector.dep66))
            .bind('dep68', async injector => 1 + (await injector.dep67))
            .bind('dep69', async injector => 1 + (await injector.dep68))
            .bind('dep70', async injector => 1 + (await injector.dep69))
            .bind('dep71', async injector => 1 + (await injector.dep70))
            .bind('dep72', async injector => 1 + (await injector.dep71))
            .bind('dep73', async injector => 1 + (await injector.dep72))
            .bind('dep74', async injector => 1 + (await injector.dep73))
            .bind('dep75', async injector => 1 + (await injector.dep74))
            .bind('dep76', async injector => 1 + (await injector.dep75))
            .bind('dep77', async injector => 1 + (await injector.dep76))
            .bind('dep78', async injector => 1 + (await injector.dep77))
            .bind('dep79', async injector => 1 + (await injector.dep78))
            .bind('dep80', async injector => 1 + (await injector.dep79))
            .bind('dep81', async injector => 1 + (await injector.dep80))
            .bind('dep82', async injector => 1 + (await injector.dep81))
            .bind('dep83', async injector => 1 + (await injector.dep82))
            .bind('dep84', async injector => 1 + (await injector.dep83))
            .bind('dep85', async injector => 1 + (await injector.dep84))
            .bind('dep86', async injector => 1 + (await injector.dep85))
            .bind('dep87', async injector => 1 + (await injector.dep86))
            .bind('dep88', async injector => 1 + (await injector.dep87))
            .bind('dep89', async injector => 1 + (await injector.dep88))
            .bind('dep90', async injector => 1 + (await injector.dep89))
            .bind('dep91', async injector => 1 + (await injector.dep90))
            .bind('dep92', async injector => 1 + (await injector.dep91))
            .bind('dep93', async injector => 1 + (await injector.dep92))
            .bind('dep94', async injector => 1 + (await injector.dep93))
            .bind('dep95', async injector => 1 + (await injector.dep94))
            .bind('dep96', async injector => 1 + (await injector.dep95))
            .bind('dep97', async injector => 1 + (await injector.dep96))
            .bind('dep98', async injector => 1 + (await injector.dep97))
            .bind('dep99', async injector => 1 + (await injector.dep98))
            .bind('dep100', async injector => 1 + (await injector.dep99))
            .bind('dep101', async injector => 1 + (await injector.dep100))
            .bind('dep102', async injector => 1 + (await injector.dep101))
            .bind('dep103', async injector => 1 + (await injector.dep102))
            .bind('dep104', async injector => 1 + (await injector.dep103))
            .bind('dep105', async injector => 1 + (await injector.dep104))
            .bind('dep106', async injector => 1 + (await injector.dep105))
            .bind('dep107', async injector => 1 + (await injector.dep106))
            .bind('dep108', async injector => 1 + (await injector.dep107))
            .bind('dep109', async injector => 1 + (await injector.dep108))
            .bind('dep110', async injector => 1 + (await injector.dep109))
            .bind('dep111', async injector => 1 + (await injector.dep110))
            .bind('dep112', async injector => 1 + (await injector.dep111))
            .bind('dep113', async injector => 1 + (await injector.dep112))
            .bind('dep114', async injector => 1 + (await injector.dep113))
            .bind('dep115', async injector => 1 + (await injector.dep114))
            .bind('dep116', async injector => 1 + (await injector.dep115))
            .bind('dep117', async injector => 1 + (await injector.dep116))
            .bind('dep118', async injector => 1 + (await injector.dep117))
            .bind('dep119', async injector => 1 + (await injector.dep118))
            .bind('dep120', async injector => 1 + (await injector.dep119))
            .bind('dep121', async injector => 1 + (await injector.dep120))
            .bind('dep122', async injector => 1 + (await injector.dep121))
            .bind('dep123', async injector => 1 + (await injector.dep122))
            .bind('dep124', async injector => 1 + (await injector.dep123))
            .bind('dep125', async injector => 1 + (await injector.dep124))
            .bind('dep126', async injector => 1 + (await injector.dep125))
            .bind('dep127', async injector => 1 + (await injector.dep126))
            .bind('dep128', async injector => 1 + (await injector.dep127))
            .bind('dep129', async injector => 1 + (await injector.dep128))
            .bind('dep130', async injector => 1 + (await injector.dep129))
            .bind('dep131', async injector => 1 + (await injector.dep130))
            .bind('dep132', async injector => 1 + (await injector.dep131))
            .bind('dep133', async injector => 1 + (await injector.dep132))
            .bind('dep134', async injector => 1 + (await injector.dep133))
            .bind('dep135', async injector => 1 + (await injector.dep134))
            .bind('dep136', async injector => 1 + (await injector.dep135))
            .bind('dep137', async injector => 1 + (await injector.dep136))
            .bind('dep138', async injector => 1 + (await injector.dep137))
            .bind('dep139', async injector => 1 + (await injector.dep138))
            .bind('dep140', async injector => 1 + (await injector.dep139))
            .bind('dep141', async injector => 1 + (await injector.dep140))
            .bind('dep142', async injector => 1 + (await injector.dep141))
            .bind('dep143', async injector => 1 + (await injector.dep142))
            .bind('dep144', async injector => 1 + (await injector.dep143))
            .bind('dep145', async injector => 1 + (await injector.dep144))
            .bind('dep146', async injector => 1 + (await injector.dep145))
            .bind('dep147', async injector => 1 + (await injector.dep146))
            .bind('dep148', async injector => 1 + (await injector.dep147))
            .bind('dep149', async injector => 1 + (await injector.dep148))
            .bind('dep150', async injector => 1 + (await injector.dep149))
            .bind('dep151', async injector => 1 + (await injector.dep150))
            .bind('dep152', async injector => 1 + (await injector.dep151))
            .bind('dep153', async injector => 1 + (await injector.dep152))
            .bind('dep154', async injector => 1 + (await injector.dep153))
            .bind('dep155', async injector => 1 + (await injector.dep154))
            .bind('dep156', async injector => 1 + (await injector.dep155))
            .bind('dep157', async injector => 1 + (await injector.dep156))
            .bind('dep158', async injector => 1 + (await injector.dep157))
            .bind('dep159', async injector => 1 + (await injector.dep158))
            .bind('dep160', async injector => 1 + (await injector.dep159))
            .bind('dep161', async injector => 1 + (await injector.dep160))
            .bind('dep162', async injector => 1 + (await injector.dep161))
            .bind('dep163', async injector => 1 + (await injector.dep162))
            .bind('dep164', async injector => 1 + (await injector.dep163))
            .bind('dep165', async injector => 1 + (await injector.dep164))
            .bind('dep166', async injector => 1 + (await injector.dep165))
            .bind('dep167', async injector => 1 + (await injector.dep166))
            .bind('dep168', async injector => 1 + (await injector.dep167))
            .bind('dep169', async injector => 1 + (await injector.dep168))
            .bind('dep170', async injector => 1 + (await injector.dep169))
            .bind('dep171', async injector => 1 + (await injector.dep170))
            .bind('dep172', async injector => 1 + (await injector.dep171))
            .bind('dep173', async injector => 1 + (await injector.dep172))
            .bind('dep174', async injector => 1 + (await injector.dep173))
            .bind('dep175', async injector => 1 + (await injector.dep174))
            .bind('dep176', async injector => 1 + (await injector.dep175))
            .bind('dep177', async injector => 1 + (await injector.dep176))
            .bind('dep178', async injector => 1 + (await injector.dep177))
            .bind('dep179', async injector => 1 + (await injector.dep178))
            .bind('dep180', async injector => 1 + (await injector.dep179))
            .bind('dep181', async injector => 1 + (await injector.dep180))
            .bind('dep182', async injector => 1 + (await injector.dep181))
            .bind('dep183', async injector => 1 + (await injector.dep182))
            .bind('dep184', async injector => 1 + (await injector.dep183))
            .bind('dep185', async injector => 1 + (await injector.dep184))
            .bind('dep186', async injector => 1 + (await injector.dep185))
            .bind('dep187', async injector => 1 + (await injector.dep186))
            .bind('dep188', async injector => 1 + (await injector.dep187))
            .bind('dep189', async injector => 1 + (await injector.dep188))
            .bind('dep190', async injector => 1 + (await injector.dep189))
            .bind('dep191', async injector => 1 + (await injector.dep190))
            .bind('dep192', async injector => 1 + (await injector.dep191))
            .bind('dep193', async injector => 1 + (await injector.dep192))
            .bind('dep194', async injector => 1 + (await injector.dep193))
            .bind('dep195', async injector => 1 + (await injector.dep194))
            .bind('dep196', async injector => 1 + (await injector.dep195))
            .bind('dep197', async injector => 1 + (await injector.dep196))
            .bind('dep198', async injector => 1 + (await injector.dep197))
            .bind('dep199', async injector => 1 + (await injector.dep198))
            .bind('dep200', async injector => 1 + (await injector.dep199))
            .bind(
                'result',
                async (injector: Injector<{ base: number; dep200: number }>) =>
                    (await injector.base) + (await injector.dep200),
            );

        it('works', async () => {
            const { container } = await design.resolve({ base: 1000 });
            expect(container.result).toBe(1200);
        });
    });

    describe('use', () => {
        it('executes given function in a resource safe manner', async () => {
            const messages: string[] = [];
            const design = Design.bind(
                'resource',
                async () => {
                    messages.push('resource creating');
                    return 'test-resource';
                },
                async () => {
                    messages.push('resource finalizing');
                },
            );

            const result = await design.use({})(async ({ resource }) => {
                messages.push(`using resource: ${resource}`);
                return 'processed';
            });
            expect(result).toEqual('processed');
            expect(messages).toEqual(['resource creating', 'using resource: test-resource', 'resource finalizing']);
        });

        it('executes given function even when promise rejected', async () => {
            const messages: string[] = [];
            const design = Design.bind(
                'resource',
                async () => {
                    messages.push('resource creating');
                    return 'test-resource';
                },
                async () => {
                    messages.push('resource finalizing');
                },
            );

            try {
                await design.use({})(async () => {
                    throw new Error('fail');
                });
            } catch (e) {}
            expect(messages).toEqual(['resource creating', 'resource finalizing']);
        });
    });
});
