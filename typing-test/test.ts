import { Design, Injector } from 'typesafe-di';

type HasKey0<T> = { key0: T }

const baseDesign = Design.empty
  .bind('key1', (injector: Injector<HasKey0<string>>) => injector.key0);

const compiles = baseDesign.resolve({ key0: 'string' });

const invalidType = baseDesign.resolve({ key0: 123 }); // $ExpectError

const insufficientRequirements = baseDesign.resolve({}); // $ExpectError

const conflictedInjectorType = baseDesign
  .bind('key2', (injector: Injector<HasKey0<number>>) => injector.key0)
  .resolve({ key0: 'abc' }); // $ExpectError

const conflictedResolverType = baseDesign
  .bind('key0', () => 123)
  .resolve({}); // $ExpectError
