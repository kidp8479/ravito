# Color palette

Single source of truth for diagram colors. The generator's named colors
map to Excalidraw's standard stroke palette:

| Name | Stroke | Use for |
|---|---|---|
| `blue` | `#1971c2` | primary components, frontend, app code |
| `violet` | `#6741d9` | services, gateways, controllers |
| `green` | `#2f9e44` | databases, stores, success states |
| `teal` | `#099268` | secondary infra, caches, queues (alt) |
| `cyan` | `#0c8599` | network, external APIs, third parties |
| `orange` | `#e8590c` | message queues, events, async |
| `yellow` | `#f08c00` | decisions, warnings |
| `red` | `#e03131` | errors, end states, eliminatory risks |
| `gray` | `#868e96` | users, actors, out-of-scope boxes |
| `black` | `#1e1e1e` | text, arrows, borders |

## Rules

- One role, one color, across the whole diagram. All databases green, all
  services violet, do not vary it per box.
- Fill stays light (the generator picks the matching light background) or
  transparent. No dark fills, no gradients.
- Arrows and text are `black` unless the arrow color carries meaning
  (e.g. `red` for an error path).
- Keep it to 3 to 5 colors per diagram. More than that and the color
  stops meaning anything.
