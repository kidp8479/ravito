"""Regenerates shopping-list-realtime.excalidraw. Run via the
excalidraw-diagrams skill:

    python3 docs/diagrams/shopping-list-realtime.py
    cd .claude/skills/excalidraw-diagrams/scripts && npm install
    node export_playwright.js \
        ../../../../docs/diagrams/shopping-list-realtime.excalidraw \
        ../../../../docs/diagrams/shopping-list-realtime.png
"""

import sys, os, subprocess

root = subprocess.check_output(
    ['git', 'rev-parse', '--show-toplevel'], text=True
).strip()
sys.path.insert(0, os.path.join(root, '.claude/skills/excalidraw-diagrams/scripts'))
from excalidraw_generator import Diagram

d = Diagram()

d.text_box(40, 20, 'Ravito - shopping list real-time sync (ADR 0003)', font_size=24)
d.text_box(
    40, 60,
    'WebSocket gateway (Socket.IO), room per household - writes stay REST, the gateway only pushes',
    font_size=14, color='#868e96',
)

# --- Phase 1: connect + authenticate ------------------------------------
d.text_box(60, 120, '1. Connect (on login / token refresh)', font_size=16, color='#868e96')

client_a1 = d.box(40, 190, 'Client A\n(member)', width=170, height=70, color='gray')
gateway_connect = d.box(
    380, 170,
    "ShoppingListGateway\nhandleConnection()\n\nauth: { token, householdId }\nverify JWT (ADR 0002)",
    width=320, height=120, color='violet',
)
d.arrow_between(client_a1, gateway_connect, 'connect', from_side='right', to_side='left')

member_check = d.box(
    800, 155, 'member of\nhousehold?',
    width=210, height=150, color='yellow', shape='diamond',
)
d.arrow_between(gateway_connect, member_check, from_side='right', to_side='left')
d.text_box(795, 320, '(same check as\nHouseholdMembershipGuard)', font_size=12, color='#868e96')

join_room = d.box(1100, 140, 'socket.join(\n"household:<id>")', width=250, height=80, color='violet')
d.arrow_between(member_check, join_room, 'yes', from_side='right', to_side='left')

disconnect = d.box(1100, 280, 'client.disconnect(true)', width=250, height=70, color='red')
d.arrow_between(member_check, disconnect, 'no', from_side='right', to_side='left')

# --- Phase 2: write + broadcast ------------------------------------------
d.text_box(60, 430, '2. A member writes - every connected member is pushed the change', font_size=16, color='#868e96')

client_a2 = d.box(40, 500, 'Client A', width=170, height=60, color='gray')
write_api = d.box(
    380, 460,
    'POST / PATCH / DELETE\n.../households/:id/shopping-list\n\n(ShoppingListController +\nShoppingListService)\nguarded + validated as usual',
    width=340, height=160, color='violet',
)
d.arrow_between(client_a2, write_api, 'REST', from_side='right', to_side='left')

item_db = d.box(820, 495, 'ShoppingListItem', width=220, height=70, color='green')
d.arrow_between(write_api, item_db, 'write', from_side='right', to_side='left')

emit = d.box(
    380, 700,
    'gateway.emitCreated() /\nemitUpdated() / emitDeleted()',
    width=340, height=90, color='violet',
)
d.arrow_between(write_api, emit, 'after commit', from_side='bottom', to_side='top')

room = d.box(850, 705, 'room\n"household:<id>"', width=220, height=80, color='orange')
d.arrow_between(emit, room, 'item.*', from_side='right', to_side='left')

client_a3 = d.box(1150, 650, "Client A\n(own socket - echo)", width=250, height=70, color='gray')
client_b = d.box(1150, 750, 'Client B\n(other member)', width=250, height=70, color='gray')
d.arrow_between(room, client_a3, from_side='right', to_side='left')
d.arrow_between(room, client_b, from_side='right', to_side='left')

cache_note = d.box(
    1150, 850,
    'TanStack Query cache:\nupsert/remove in place,\nno refetch (RAV-14)',
    width=250, height=90, color='blue',
)
d.arrow_between(client_b, cache_note, from_side='bottom', to_side='top')

d.text_box(
    40, 960,
    'Writes are always plain REST/HTTP, guarded and validated exactly like every other mutating route - the gateway never\n'
    'accepts a client-originated write, it only ever pushes what a REST mutation already committed.',
    font_size=13, color='#868e96',
)

out = os.path.join(root, 'docs/diagrams/shopping-list-realtime.excalidraw')
d.save(out)
print(f'written {out}')
