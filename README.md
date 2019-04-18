# typesafe-di

A zero-dependency simple DI library to create DI containers in typesafe way.

# installation

```
yarn add typesafe-di
```

# Getting Started

### Design your depedencies

```typescript
type HasName = { name: string };
type HasAge = { age: number };

// Design is an immutable blueprint of a container which knows how to build each item.
const design = Design.empty
  .bind('age', () => 30)
  // Injector<{ [key]: T }> is just a type alias of { [key]: Promise<T> }.
  // Here, it means we need { name: string, age: number } to create a user.
  .bind('user', async (injector: Injector<HasName & HasAge>) => new User(
    await injector.name,
    await injector.age,
  ));
```

### Resolve the dependencies

```typescript
// The design can resolve with missing values.
const { container } = await design.resolve({ name: 'jooohn' });
// { name: 'jooohn', age: 30, user: User { name: 'jooohn', age: 30 } }

// If the dependencies are insufficient, its compile fails.
const { container } = await design.resolve({}); // compile error! Property 'name' is missing in type {}
```

### Design is composable

```typescript
const useCaseDesign = Design.empty
  .bind('createUser', async (injector: Injector<HasUserRepository>) => new CreateUser({
    userRepository: await injector.userRepository
  }));

const productionAdapter = Design.empty
  .bind('userRepository', async (injector: Injector<HasDB>) => new DBUserRepository({
    db: await injector.db
  }));

const testAdapter = Design.empty
  .bind('userRepository', () => new InMemoryUserRepository());

// for production
useCaseDesign.merge(productionAdapter).resolve({ db: productionDB });

// for test
useCaseDesign.merge(testAdapter).resolve({});
```

### Finalize resource

```typescript
// The third argument for `bind` is an optional finalizer of the resource.
const design = Design.empty
  .bind('db', () => buildDB(), db => db.close)
  .bind(
    'repository',
    async (injector: Injector<HasDB>) => new Repository(await injector.db),
    repository => repository.close()
  );

const { container, finalize } = design.resolve({});

// Finalize calls finalizer from less-dependent resources to more-dependent resources.
// In this case, it will call a finalizer for 'db' and then call one for 'repository'.
await finalize();
```
