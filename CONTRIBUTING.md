# Contributing to Hashi

Thanks for your interest. Hashi is in pre-alpha — APIs and packages will change.

## Quick start

```bash
git clone https://github.com/hashi-mcp/hashi.git
cd hashi
corepack enable && corepack prepare pnpm@10 --activate
pnpm install
pnpm build
pnpm test
```

## Repo layout

```
hashi/
├── packages/        # npm-published TypeScript packages (@hashi-mcp/*)
├── sdks/            # plugin SDKs in C#, Python, Lua, JS (future)
├── examples/        # reference bridges (Excel, Blender, OBS, Revit, ...) (future)
├── docs/            # documentation site (future)
└── studio/          # Hashi Studio Tauri tray app (future)
```

## Stack

- **TypeScript** strict, ES2022, ESM-only
- **pnpm workspaces** monorepo
- **tsup** for package bundling
- **vitest** for tests
- **biome** for lint and format
- **changesets** for versioning and release notes

## How to propose a change

1. Open an issue first for non-trivial work
2. Fork and branch from `main`
3. Run `pnpm lint` and `pnpm test` locally before pushing
4. Add a changeset: `pnpm changeset` (describes user-facing change)
5. Open a PR — CI must pass

## Code style

- ESM imports only, no CommonJS
- Explicit types on public APIs (`export function ...`)
- No `any` unless justified in a comment
- Single quotes, no semicolons except where required, trailing commas
- Biome enforces all of the above

## Licensing

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
