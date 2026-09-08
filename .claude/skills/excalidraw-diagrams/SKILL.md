---
name: excalidraw-diagrams
description: Generate editable .excalidraw diagrams (flowcharts, architecture, system design, sequence of steps) instead of ASCII art, then render to PNG and check the result. Use when the user wants a diagram, a schema, a visual of a flow / architecture, or something to drop into the team Excalidraw or Miro canvas.
---

# excalidraw-diagrams

Generates `.excalidraw` JSON with a Python library (pure stdlib, works
offline), renders it to PNG with Playwright, then **looks at the PNG and
fixes what is wrong** before handing it over.

Output opens directly at excalidraw.com, in the VS Code Excalidraw
extension, or dropped into the team canvas.

## 1. Design before drawing

- **Isomorphism test**: if every text label were removed, would the shape
  and layout still carry the idea? If not, the layout is wrong, fix that
  first, not the labels.
- **One diagram, one claim.** Decide the single thing it must show
  (a data flow, a failure path, a layering). Cut anything that does not
  serve it.
- Pick colors from `color-palette.md` and hold the mapping constant
  (all databases green, all services violet, ...).
- Left to right for a pipeline, top to bottom for a decision flow. Grid
  positions on multiples of 50.

## 2. Generate

Use the library, not hand-written JSON:

```bash
python3 -c "
import sys, os, subprocess
root = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip()
sys.path.insert(0, os.path.join(root, '.claude/skills/excalidraw-diagrams/scripts'))
from excalidraw_generator import Diagram, Flowchart, ArchitectureDiagram

d = Diagram()
d.text_box(180, 20, 'Auth flow', font_size=24)
u  = d.box(80, 100, 'Client', color='gray')
api= d.box(300, 100, 'API', color='violet')
db = d.box(520, 100, 'Users DB', color='green', shape='ellipse')
d.arrow_between(u, api, 'POST /login')
d.arrow_between(api, db, 'SELECT')
d.save('/abs/path/auth-flow.excalidraw')
print('written')
"
```

Classes: `Diagram` (free positioning), `Flowchart` (auto vertical/
horizontal), `AutoLayoutFlowchart` (hierarchical, needs `grandalf`),
`ArchitectureDiagram` (component/service/database/user helpers). Full API
in `scripts/excalidraw_generator.py` docstrings. `save_to_drive()` is not
wired in this install (see `NOTICE.md`), use `save()`.

## 3. Render and check - the loop

```bash
cd "$(git rev-parse --show-toplevel)/.claude/skills/excalidraw-diagrams/scripts"
npm install            # first time only; reuses ~/.cache/ms-playwright chromium
node export_playwright.js /abs/path/auth-flow.excalidraw /abs/path/auth-flow.png
```

Then **read the PNG** (Read tool) and check against this list:

- Do any boxes or arrows overlap? Do arrows cross when they need not?
- Does an arrow start/end on the wrong side of a box?
- Is text clipped or spilling out of its box?
- Is the reading order obvious without explanation?
- Are the colors consistent with the mapping from step 1?

Fix in the Python script, regenerate, re-render, re-read. Repeat until it
is clean. Do not hand over a diagram you have not looked at.

## 4. Hand over

Give the user the `.excalidraw` path (editable, for the team canvas) and
the `.png` (for Slack / Linear / docs). If they use it in the interview
or defense, mention it is editable so they can adjust it live.

## 5. Publishing and keeping in sync (42 projects)

A diagram that documents a system is versioned with the code and
mirrored where the team reads:

- **Repo**: `docs/diagrams/<name>.{excalidraw,png,py}` plus a
  `README.md`. The `.excalidraw` is the source of truth; the `.py`
  regenerates it; the `.png` is the rendered view. Commit on its own
  branch / Linear issue like any change.
- **Linear**: one document per domain (e.g. "Auth - architecture" in the
  project, tagged with the domain label), embedding the `.png` and a
  short prose walk-through, linked from the domain's issues. Upload the
  PNG as an attachment on an issue to get a hosted URL, then
  `![](that-url)` in the document. `save_document` takes `patch` for
  incremental refreshes.
- **When the code changes**: edit the `.excalidraw` (or the `.py`),
  re-render, re-check (step 3), commit, then refresh the Linear
  document's image. The natural cadence is "when the feature that
  changed the flow merges".

The signed Linear upload URL expires in 60s - prepare and PUT back to
back, do not compose anything in between.

## Offline / school machine

- **Generation (step 2) works offline** - pure stdlib.
- **Rendering (step 3) needs network**: `export_playwright.js` loads
  excalidraw.com. Behind the school proxy it may fail. Fallback: skip the
  render, open the `.excalidraw` in the team canvas and eyeball it there.
- On a fresh machine: `npm install` in `scripts/` then
  `npx playwright install chromium` once.

## Why a skill

- Triggers on "fais un diagramme / un schéma", zero context cost otherwise.
- Step 3 (render, look, fix) is what separates a usable diagram from
  boxes that overlap - it is the point of the skill, not an optional
  extra.
