"""Regenerates auth.excalidraw. Run via the excalidraw-diagrams skill:

    python3 docs/diagrams/auth.py
    cd .claude/skills/excalidraw-diagrams/scripts && npm install
    node export_playwright.js ../../../../docs/diagrams/auth.excalidraw \
        ../../../../docs/diagrams/auth.png
"""

import sys, os, subprocess

root = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip()
sys.path.insert(0, os.path.join(root, '.claude/skills/excalidraw-diagrams/scripts'))
from excalidraw_generator import Diagram

d = Diagram()

d.text_box(40, 20, 'Ravito - auth & household flows', font_size=24)
d.text_box(40, 60, 'register / login / refresh (ADR 0002) / create or join a household', font_size=14, color='#868e96')

d.text_box(60, 120, 'Client', font_size=16, color='#868e96')
d.text_box(360, 120, 'API (NestJS)', font_size=16, color='#868e96')
d.text_box(1100, 120, 'Database (Postgres)', font_size=16, color='#868e96')

auth_db = d.box(1080, 160, 'User\n\nRefreshToken', width=260, height=470, color='green')

# --- Row 1: register ---------------------------------------------------
client1 = d.box(40, 200, 'Client', width=130, height=60, color='gray')
api_register = d.box(
    340, 160,
    'POST /auth/register\n\n201 { accessToken }\n+ Set-Cookie refresh_token\n(httpOnly, 30d)',
    width=320, height=140, color='violet',
)
d.arrow_between(client1, api_register, from_side='right', to_side='left')
d.arrow_between(api_register, auth_db, 'argon2id hash', from_side='right', to_side='left')

# --- Row 2: login --------------------------------------------------------
client2 = d.box(40, 370, 'Client', width=130, height=60, color='gray')
api_login = d.box(
    340, 340,
    'POST /auth/login\n\n200 { accessToken }\n+ Set-Cookie refresh_token',
    width=320, height=120, color='violet',
)
d.arrow_between(client2, api_login, from_side='right', to_side='left')
d.arrow_between(api_login, auth_db, 'verify hash', from_side='right', to_side='left')

# --- Row 3: refresh, with the rotation / reuse-detection branch ---------
client3 = d.box(40, 535, 'Client', width=130, height=60, color='gray')
api_refresh = d.box(
    340, 500,
    'POST /auth/refresh\nCookie: refresh_token\n\n200 { accessToken }\n+ new Set-Cookie refresh_token',
    width=320, height=130, color='violet',
)
d.arrow_between(client3, api_refresh, '(cookie)', from_side='right', to_side='left')

reuse_check = d.box(800, 515, 'token already\nrevoked?', width=140, height=100, color='yellow', shape='diamond')
d.arrow_between(api_refresh, reuse_check, from_side='right', to_side='left')
d.arrow_between(reuse_check, auth_db, 'no', from_side='right', to_side='left')

theft = d.box(770, 660, '401 - revoke ALL of this\nuser\'s refresh tokens\n(theft response, ADR 0002)', width=200, height=110, color='red')
d.arrow_between(reuse_check, theft, 'yes', from_side='bottom', to_side='top')

# --- Row 4: household create / join -------------------------------------
client4 = d.box(40, 845, 'Client', width=130, height=60, color='gray')
api_household = d.box(
    340, 830,
    'POST /households\nor /households/join { code }',
    width=320, height=90, color='violet',
)
d.arrow_between(client4, api_household, from_side='right', to_side='left')

join_check = d.box(800, 850, 'code\nprovided?', width=140, height=110, color='yellow', shape='diamond')
d.arrow_between(api_household, join_check, from_side='right', to_side='left')

create_db = d.box(1080, 790, 'Household\n+ HouseholdMember\n(OWNER)', width=260, height=100, color='green')
d.arrow_between(join_check, create_db, 'no', from_side='top', to_side='left')

join_db = d.box(1080, 940, 'HouseholdInvite\n+ HouseholdMember\n(MEMBER)', width=260, height=100, color='green')
d.arrow_between(join_check, join_db, 'yes', from_side='bottom', to_side='left')

out = os.path.join(root, 'docs/diagrams/auth.excalidraw')
d.save(out)
print('written', out)
