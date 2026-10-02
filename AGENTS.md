# AGENTS.md

Rules for coding agents in this repository. Read `README.md` for what the library is and how to use it, and `CONTRIBUTING.md` for branches, pull requests, commits and releases. This file does not repeat them.

## Scope

- This repository is public. Do not add internal hostnames, account ids, service names or other non-public detail to code, docs, commits or pull requests.
- The library has no runtime dependencies. Do not add one.
- Every change ships to the services that depend on the package on their next install. Treat a change to the public API (`src/index.ts` exports and their types) as breaking unless you can show it is not.

## Never commit

- `lib/` (build output) or `node_modules/`. Both are ignored.
- npm tokens or any other credential.

## Before a pull request

Run all three; they are what `npm publish` runs:

```
yarn test
yarn tsd
yarn lint
```

Do not run `npm version` or `npm publish`. A person cuts releases.

## Decisions

Before a change that touches architecture or a shared choice, read `docs/decisions/README.md`. Open only the records whose rows bear on the change. Do not accept a decision yourself; propose it in a pull request.
