# frontend

React 19 + Vite + TypeScript, TanStack Router (file-based) + TanStack
Query, Tailwind CSS v4 (ready for shadcn/ui components), PWA via
`vite-plugin-pwa`.

Conventions, workflow, and how to run this alongside the backend: see the
repo root `CLAUDE.md` and `CONTRIBUTING.md`.

## Local dev

```sh
npm install
npm run dev
```

Or `make up` from the repo root to run the full stack (db + backend +
frontend) in containers.

## Scripts

- `npm run dev` - Vite dev server
- `npm run build` - typecheck (`tsc -b`) + production build
- `npm run format` / `format:check` - Prettier
- `npm run lint` / `lint:check` - ESLint
- `npm run typecheck` - `tsc -b`
