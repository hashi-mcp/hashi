# Changesets

Hashi uses [Changesets](https://github.com/changesets/changesets) to manage versions, changelogs, and releases across the monorepo.

## Adding a changeset

When you make a user-facing change to a package, add a changeset:

```bash
pnpm changeset
```

Pick the affected packages, the bump type (patch / minor / major), and write a one-line summary describing the change.

The changeset is committed alongside your PR. The release workflow consumes it on merge.
