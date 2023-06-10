import { Design, Injector } from 'typesafe-di';

type HasKey0<T> = { key0: T };

const baseDesign = Design.bind('key1', (injector: Injector<HasKey0<string>>) => injector.key0);

const compiles = baseDesign.resolve({ key0: 'string' });

const invalidType = baseDesign.resolve({ key0: 123 }); // $ExpectError

const insufficientRequirements = baseDesign.resolve({}); // $ExpectError

const conflictedInjectorType = baseDesign
    .bind('key2', (injector: Injector<HasKey0<number>>) => injector.key0)
    .resolve({ key0: 'abc' }); // $ExpectError

const conflictedResolverType = baseDesign.bind('key0', () => 123).resolve({}); // $ExpectError

const implicitAndExplicitInjector = Design.bind('nums', async () => [1, 2, 3, 4, 5])
    .bind('double', async () => (num: number) => num * 2)
    // Here `injector` assumes existing `nums` and `double` are injectable by default.
    .bind('implicit', async injector => {
        const nums = await injector.nums;
        const double = await injector.double;
        return nums.map(double);
    })
    // Or you can specify requirements explicitly.
    .bind('explicit', async (injector: Injector<{ bool: boolean }>) => !(await injector.bool))
    .resolve({ bool: true });

const zeroDependencies = Design.bind('zero', () => 3);
Design.bind('needsA', async (injector: Injector<{ a: number }>) => await injector.a)
    .merge(zeroDependencies)
    .resolve({}); // $ExpectError
