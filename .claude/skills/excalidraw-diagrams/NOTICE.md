# Provenance

The Python generator in `scripts/` is vendored from a third-party skill:

- Upstream: https://github.com/robtaylor/excalidraw-diagrams
- Commit: `cd421f0c0efe097a6ce757725822c8ebb4920085` (2026-01-07)
- License: MIT (see `LICENSE.upstream`)

## Local changes

- Dropped `drive_helper.py`, `create_capability_zip.py`, the test suite and
  `.github/` - Google Drive / capability-zip integration is not used here.
  `Diagram.save_to_drive()` therefore raises `ImportError`; use `save()`.
- `SKILL.md` and `color-palette.md` are rewritten for this setup (they are
  not the upstream files). The methodology section restates general
  diagram-design principles (the "isomorphism test", the render-and-check
  loop) in our own words.

To update: re-pull the upstream commit, re-apply the trim, diff `SKILL.md`.
