"""Regenerates architecture.excalidraw. Run via the excalidraw-diagrams
skill:

    python3 docs/diagrams/architecture.py
    cd .claude/skills/excalidraw-diagrams/scripts && npm install
    node export_playwright.js ../../../../docs/diagrams/architecture.excalidraw \
        ../../../../docs/diagrams/architecture.png
"""

import sys, os, subprocess

root = subprocess.check_output(
    ['git', 'rev-parse', '--show-toplevel'], text=True
).strip()
sys.path.insert(0, os.path.join(root, '.claude/skills/excalidraw-diagrams/scripts'))
from excalidraw_generator import Diagram

d = Diagram()

d.text_box(40, 20, 'Ravito - architecture (C4 levels 1-2)', font_size=24)
d.text_box(
    40, 60,
    'Level 1: system context. Level 2: containers inside that system.',
    font_size=14, color='#868e96',
)

# --- Level 1: System context --------------------------------------------
d.text_box(60, 120, '1. System context', font_size=16, color='#868e96')

member = d.box(80, 170, 'Household\nmember', width=180, height=80, color='gray', shape='ellipse')
system = d.box(500, 160, 'Ravito', width=280, height=100, color='blue')
d.arrow_between(member, system, 'HTTPS', from_side='right', to_side='left')
d.text_box(
    340, 300,
    'Manages the household pantry & shopping list. No external systems in v1 - Ravito is self-contained (CLAUDE.md).',
    font_size=13, color='#868e96',
)

# --- Level 2: Containers --------------------------------------------------
d.text_box(60, 380, '2. Containers (inside the Ravito system boundary)', font_size=16, color='#868e96')

# Deployment boundary (docker-compose) drawn as a large background box
# behind the three containers - added to the diagram first so it sits
# underneath them, not on top.
d.box(360, 430, '', width=900, height=380, color='gray')
d.text_box(380, 440, 'docker-compose (dev / single-host deploy)', font_size=13, color='#868e96')

member2 = d.box(80, 540, 'Household\nmember', width=180, height=80, color='gray', shape='ellipse')

frontend = d.box(
    420, 500,
    'Frontend\n\nReact + Vite, PWA\nTanStack Router/Query\nService worker (offline shell,\nRAV-19) + persisted cache',
    width=280, height=180, color='blue',
)
backend = d.box(
    910, 500,
    'Backend API\n\nNestJS\nREST endpoints +\nWebSocket gateway (RAV-14)',
    width=280, height=140, color='violet',
)
database = d.box(
    960, 700, 'Database\n\nPostgreSQL', width=200, height=90, color='green', shape='ellipse',
)

d.arrow_between(member2, frontend, 'HTTPS', from_side='right', to_side='left')
d.arrow_between(frontend, backend, 'REST + WebSocket', from_side='right', to_side='left')
d.arrow_between(backend, database, 'SQL', from_side='bottom', to_side='top')

d.text_box(
    40, 840,
    'Backend and Database each run as their own docker-compose service; the frontend is built to static assets and served\n'
    'separately (nginx-shaped, not itself a long-running app process) - see docker-compose.yml.',
    font_size=13, color='#868e96',
)

out = os.path.join(root, 'docs/diagrams/architecture.excalidraw')
d.save(out)
print(f'written {out}')
