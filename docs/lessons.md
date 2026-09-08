# Lessons

Patterns from course corrections, kept here so they aren't repeated.

## Rootless Podman on SELinux (Fedora): bind mounts need `:Z`

**Symptom**: `make up` on a Fedora host with SELinux enforcing built the
backend image fine, but the container crash-looped on `npm run start:dev`
with `EACCES: permission denied, open '/app/package.json'` - despite the
bind-mounted file showing normal, readable Unix permissions
(`-rw-r--r-- root root`) both on the host and inside the container.

**Cause**: standard Unix permissions are necessary but not sufficient on an
SELinux-enforcing host. Podman needs the bind mount relabeled for the
container's SELinux context, or access is denied at the MAC layer
regardless of the DAC (`rwx`) bits. Docker doesn't hit this (no SELinux
enforcement in the usual Docker setups), which is why the existing
rootless-Podman guidance in `CONTRIBUTING.md` (named volumes for anything
the container writes) didn't cover it - that guidance is about *write*
access via ownership, this is about *read* access via SELinux labels.

**Fix**: suffix host bind mounts with `:Z` (private/unshared label) in
`docker-compose.yml`, e.g. `./backend:/app:Z`. Docker on non-SELinux hosts
ignores the flag, so this is safe across both runtimes. Apply it to every
bind-mounted source directory (`frontend:/app:Z` too, once that service
exists).

## Modern npm blocks `@prisma/client`'s postinstall - `prisma generate` needs its own step

**Symptom**: worked with plain `npm install` locally (npm 10), but both the
Docker image build and GitHub Actions CI (`npm ci`) produced a
`@prisma/client` with untyped, `any`-typed methods - crashing at runtime
with `@prisma/client did not initialize yet` in the container, and failing
`eslint`'s typed rules (`no-unsafe-call` on `this.$connect()`,
`this.$queryRaw\`...\``) in CI.

**Cause**: npm's install-scripts allowlist (a supply-chain-security
feature, on by default in newer npm - the environments above run npm 11)
blocks `@prisma/client`'s postinstall script, which would otherwise run
`prisma generate` for us. Without it, `@prisma/client` ships its
pre-generate placeholder, which is why the types come out as `any` instead
of the real generated ones - not a normal type error, so it's easy to
misdiagnose as an eslint config problem.

**Fix**: never rely on the postinstall hook - run `npx prisma generate`
as its own explicit step, everywhere `npm ci`/`npm install` happens for
this package (Dockerfile, CI, and README/CONTRIBUTING setup instructions).
It needs `DATABASE_URL` to be *set* (prisma.config.ts requires it to build
the config) but never connects to it, so a syntactically valid placeholder
is enough - never a value that could look like a real credential.

## `prisma generate` run only inside the backend container doesn't reach the host

**Symptom**: after adding models to `schema.prisma` and running
`prisma migrate dev` / `prisma generate` inside the `backend` container
(needed anyway: `node_modules` can't be written from the bind mount under
rootless Podman, see the `:Z` lesson above), the pre-commit hook's
host-side `eslint` failed with dozens of `no-unsafe-*` errors on every
Prisma call site - the exact symptom of the untyped-client lesson above,
even though `prisma generate` had just been run.

**Cause**: `docker-compose.yml` mounts `backend/node_modules` as the named
volume `backend_node_modules`, not the `./backend:/app:Z` bind mount (on
purpose - see that volume's own comment). So a `prisma generate` run
inside the container writes the generated client into that volume, which
the host filesystem (and therefore the host-side `eslint`/`tsc` the
pre-commit hook runs) never sees. The host's `backend/node_modules/@prisma/client`
stays on whatever placeholder client `npm install` last put there.

**Fix**: after changing `schema.prisma`, run `npx prisma generate` once
in the container (to update the app's runtime client) *and* once on the
host from `backend/` (to update what host-side tooling sees) - the host
run never needs a reachable database, just `DATABASE_URL` set to
something syntactically valid, same as the lesson above.
