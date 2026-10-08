# Contributing

How changes reach npm in this repository. Usage is in `README.md`; agent rules are in `AGENTS.md`.

## Branches

`master` is the only long-lived branch. Merging does not publish anything. CircleCI runs `yarn lint` and `yarn test` on every push.

`master` is protected against force pushes and deletion. No reviews or status checks are required.

## Pull requests

1. Branch from `master`. Past branches use `feature/<slug>`, `fix-<slug>`, `release-<version>` and `documentation/<slug>`. Dependabot opens `dependabot/npm_and_yarn/<package>-<version>`.
2. Run `yarn test`, `yarn tsd` and `yarn lint`.
3. Open the pull request against `master`.

No `slow/` or `fast/` branches appear in this repository's history.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), for example `fix: @typescript-eslint/no-empty-function: Unexpected empty constructor`. Pull request titles follow the same format.

## Versioning and releases

The package uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version lives in `package.json` and on npm. Releases so far are `0.x`, so under SemVer a minor bump may still break the API.

To cut a release from an up-to-date `master`:

1. `npm version <patch|minor|major>`. The `preversion` script builds and runs tests, type tests and lint, then npm commits `v<version>` and tags it.
2. `git push --follow-tags`.
3. `npm publish`. The `prepublishOnly` script runs tests, type tests and lint again.
