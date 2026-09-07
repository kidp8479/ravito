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
