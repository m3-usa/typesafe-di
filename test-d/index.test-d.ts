import { Design, Injector } from '../src';
import { expectError } from 'tsd';

type HasKey0<T> = { key0: T };

const baseDesign = Design.bind('key1', (injector: Injector<HasKey0<string>>) => injector.key0);

const compiles = baseDesign.resolve({ key0: 'string' });

expectError(baseDesign.resolve({ key0: 123 })); // invalid type

expectError(baseDesign.resolve({})); // insufficient requirements

expectError(baseDesign
    .bind('key2', (injector: Injector<HasKey0<number>>) => injector.key0)
    .resolve({ key0: 'abc' })); // conflicting injector type

expectError(baseDesign.bind('key0', () => 123).resolve({})); // conflicting resolver type

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
expectError(Design.bind('needsA', async (injector: Injector<{ a: number }>) => await injector.a)
    .merge(zeroDependencies)
    .resolve({})); // zero dependencies
