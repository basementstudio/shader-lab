# Changesets

Run `bun run changeset` in a feature branch when a package change should ship.

This creates a markdown file in `.changeset` where you choose:

- `patch` for fixes
- `minor` for backward-compatible features
- `major` for breaking changes

Release flow:

1. Add a changeset in the PR
2. Merge the PR to `main`
3. `release.yml` creates or updates the automated version PR
4. Merge that generated PR
5. The package is published to npm
