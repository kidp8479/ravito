# Plan - App de courses "Garde-manger & liste partagee" (repo : `ravito`)

> Plan de travail, redige en session de conception avec l'utilisateur.
> Destine a etre repris par une autre session Claude Code pour lancer le
> projet. **Ne pas derouler tout le plan d'un coup** : avancer lot par lot,
> une issue Linear = une branche = une PR (voir section "Workflow d'equipe").
> Le scaffolding du repo (fichiers de ce dossier, issus de
> `kidp8479/42-project-template`) est deja en place ; le Lot 0 reste a faire
> (monorepo backend/frontend, `nest new`, `create vite`, CI, ADR 0001).

## Context

Faire les courses pose plusieurs problemes au quotidien : on oublie des
articles, on ne sait pas ce qu'il reste dans les placards, et la coordination
avec le foyer se fait par SMS ou papier. L'objectif a terme est un **hub
cuisine** : un inventaire central alimente par les tickets de caisse et la
saisie manuelle, consomme par une liste de courses partagee, la planification de
repas, et le suivi des prix. L'app doit aussi encourager le passage au
drive/livraison (liste prete a commander), meme si au depart les courses sont
faites en magasin physique.

Decisions prises avec l'utilisateur :

- **Perimetre v1 = socle uniquement** : inventaire + saisie manuelle rapide +
  liste de courses partagee en temps reel au sein d'un foyer.
- **Stack = la stack maison** : React + TanStack Router + TanStack Query
  (frontend), NestJS + Prisma (backend), PostgreSQL. Aligne sur `vacation_picker`
  et le workflow 42 (Hypertube).
- **Forme = PWA mobile-first** (React web installable, responsive, acces camera
  via API web pour le scan futur). Pas de natif en v1 ; une app React Native
  reutilisant la meme API NestJS reste une option ulterieure si le
  scan/hors-ligne l'exige.
- **Multi-tenant des le depart** : le "foyer" (`household`) est la frontiere
  d'isolation des donnees et la future frontiere de facturation. Objectif SaaS
  possible plus tard sans reecriture.
- **Foyer = comptes individuels + invitation par lien/code.**
- **Workflow d'equipe meme en solo** : Linear (issues/branches/PR), template
  projet, CI, ADR, diagrammes, Slack. Detail en section dediee.
- Ingestion des tickets, recettes->liste, comparaison de prix, peremption,
  rangement par rayon = **backlog**, iterations suivantes. Le modele de donnees
  v1 les anticipe.

## Stack retenue

| Couche | Choix | Note |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript | comme `vacation_picker/frontend` |
| Routing | TanStack Router | type-safe, file-based |
| Data fetching / cache | TanStack Query | cache, invalidation, retries, offline-ready |
| PWA | `vite-plugin-pwa` (Workbox) | manifest + service worker, "ajouter a l'ecran d'accueil" |
| UI | Tailwind CSS + Radix/shadcn (composants accessibles) | a acter en ADR |
| Backend | NestJS 11 + TypeScript | comme Hypertube / `vacation_picker/backend` |
| ORM | **Prisma** | schema declaratif, migrations versionnees, typage genere |
| DB | PostgreSQL 16 | |
| Temps reel | NestJS WebSocket gateway (`@nestjs/websockets` + Socket.IO) | push des changements de liste vers les membres du foyer |
| Auth | Passport (JWT access + refresh) ou sessions - **ADR au lot 1** | |
| Infra dev | `docker-compose` (db + backend + frontend), `Makefile` du template | |

Note : `vacation_picker` interdit l'ORM (contrainte deliberee pour pratiquer le
SQL). Ici on veut un socle SaaS propre et rapide : **Prisma est un choix
assume**, a acter en ADR.

## Architecture v1

```
PWA React (Vite, TanStack Router + Query, service worker)
  |
  |  HTTP (REST) + WebSocket (liste temps reel)
  v
API NestJS (modules par domaine)
  ├─ auth/         inscription, login, refresh, invitations
  ├─ households/   creer / rejoindre / membres / codes d'invitation
  ├─ products/     catalogue canonique par foyer
  ├─ inventory/    etat du garde-manger
  ├─ shopping-list/ liste partagee + gateway WebSocket
  └─ common/       TenantGuard, HouseholdMembershipGuard, interceptors, logging
  |
  v
PostgreSQL (Prisma) - chaque table metier porte household_id
```

**Isolation tenant (non negociable, marqueur "pro" + pre-requis SaaS)** :

- Toute table metier a `householdId`.
- Un `HouseholdMembershipGuard` NestJS verifie sur chaque route que
  `req.user` appartient au `householdId` cible. Les scaffolds CRUD arrivent sans
  guard : les verrouiller avant merge (rappel du `web-security-review`).
- Aucune requete "globale" cross-foyer dans le code applicatif.
- Un helper de repository (ou une extension Prisma) qui exige toujours un
  `householdId` en argument, pour rendre l'oubli difficile.

## Modele de donnees (Prisma / Postgres)

Tables v1, pensees pour accueillir le backlog sans migration lourde :

- **User** - `id`, `email` (unique), `passwordHash`, `displayName`, `createdAt`
- **Household** - `id`, `name`, `createdAt`
- **HouseholdMember** - `householdId`, `userId`, `role` (`OWNER` | `MEMBER`),
  `joinedAt` ; cle primaire composite
- **HouseholdInvite** - `id`, `householdId`, `code` (court, unique), `expiresAt`,
  `createdById`, `consumedAt` nullable
- **Product** - catalogue canonique *par foyer* : `id`, `householdId`, `name`,
  `category` (enum rayon, nullable en v1), `defaultUnit`, `createdAt`. Futur
  point d'ancrage des lignes de ticket.
- **InventoryItem** - `id`, `householdId`, `productId`, `quantity`, `unit`,
  `updatedAt`. (`expiresAt` nullable ajoute plus tard)
- **ShoppingListItem** - `id`, `householdId`, `productId` nullable (ajout libre
  non catalogue), `rawLabel`, `quantity`, `unit`, `checked` bool, `checkedById`
  nullable, `addedById`, `position`, `createdAt`
- **PurchaseHistory** *(table creee des v1, remplissage manuel)* - `id`,
  `householdId`, `productId`, `purchasedOn`, `quantity`, `unitPrice` nullable,
  `source` (`MANUAL` | `RECEIPT`). Base de l'autocomplete "tu rachetes ca
  souvent", puis de l'import tickets et du suivi prix.
- **AuditLog** *(leger, des v1)* - `id`, `householdId` nullable, `actorUserId`,
  `action`, `entity`, `entityId`, `metadata` jsonb, `createdAt`. Pas cher a
  poser tot, precieux pour un SaaS (support, conformite).

## Discipline "SaaS-ready" a tenir des la v1

1. **Tenant-first** : `householdId` sur chaque table metier, guard sur chaque
   route, jamais de requete cross-foyer.
2. **Toute la logique metier dans l'API**, rien dans le front (permet d'ajouter
   un client natif, ou d'ouvrir l'API, sans reecrire).
3. **Config 12-factor** : tout par variables d'environnement, `.env.example`
   tenu a jour, environnements dev/staging/prod sans toucher au code.
4. **Observabilite minimale** : logger structure (pino), `AuditLog`, health
   check `/healthz`.

Ce qu'un vrai passage SaaS ajoutera plus tard (hors v1) : facturation Stripe +
quotas par plan, inscription self-service durcie (verif email, reset password),
conformite RGPD (export / suppression de compte), rate-limiting, queue pour
l'OCR, cache. Aucun de ces points ne demande de revenir sur le modele v1.

## Workflow d'equipe (meme en solo)

Conventions completes dans `CLAUDE.md` et `CONTRIBUTING.md` (self-contained,
elles suivent le clone). Meme rituel que les projets 42 (Hypertube).

### Mise en place (Claude peut driver, c'est aussi de l'apprentissage agentique)

1. **GitHub** : `gh repo create ravito --private --description "..."`
   (repo perso ; la convention `42_<nom>` ne s'applique pas ici, calquer sur
   `vacation_picker`). Bootstraper depuis le template :
   `gh repo create ravito --private --template kidp8479/42-project-template`,
   puis adapter (`<PREFIX>` -> prefixe Linear, sections Docker, README).
2. **Linear** : creer **manuellement** la team dediee "Ravito" (pas d'outil MCP
   pour ca) AVANT tout le reste ; Linear genere le prefixe (`RAV`). Puis via MCP
   (`save_project`, `save_issue`) : projet + une issue par chantier, labels par
   domaine (`Backend`, `Frontend`, `Auth`, `Infra`, `Inventory`,
   `Shopping-list`), milestones = les lots ci-dessous.
3. **Integration GitHub<->Linear** : connecter le repo precis (verifier le scope
   sur github.com/settings/installations). Branche ouverte -> *In Progress*, PR
   mergee -> *Done*.
4. **Slack** : channels `ravito-general`, `ravito-daily-log`, `ravito-git-github`,
   `ravito-backend`, `ravito-frontend`, `ravito-infra`, `ravito-linear`.
   `/github subscribe kidp8479/ravito` sur `ravito-git-github` ;
   Linear<->Slack sur `ravito-linear`. MCP Slack deja connecte cote machine.

### Rituel par unite de travail

- **Une issue Linear = une branche = une PR.** Jamais de commit direct sur
  `main`. Nom de branche suggere par Linear.
- **Commits** : Conventional Commits `type(RAV-N): summary` + corps qui explique
  le *pourquoi*. Atomiques. **En anglais** (tout ce qui entre dans le repo :
  code, commentaires, commits, docs, issues Linear, posts Slack). Conversation
  avec Claude en francais.
- **Pas de tiret cadratin** (`-`) ni demi-cadratin dans les textes rediges.
- **Rebase** la branche sur `main` avant d'ouvrir et avant de merger ; jamais de
  merge de `main` dans la branche. Merge commit seulement au moment du merge PR.
- **Commentaires d'avancement** sur l'issue Linear aux points marquants, pas
  seulement a la fin.
- **Gate de merge** : `/code-review` sur le diff complet ; CI verte (format,
  lint, typecheck, test, build front + back, + scan secrets gitleaks) ; au
  moins un test par nouvelle unite de comportement (endpoint, service, gateway) ;
  les flows d'auth (register/login/refresh/logout) ont un test e2e.
- **`web-security-review`** (skill) avant de merger tout ce qui touche a l'auth
  ou aux donnees utilisateur. Chaque route mutante sur une ressource de foyer
  verifie auth **et** appartenance.
- **ADR** dans `docs/adr/NNNN-title.md` (context / decision / consequences) pour
  chaque decision structurante : choix Prisma, strategie d'auth, transport temps
  reel, forme du multi-tenant, choix UI.
- **Diagrammes** dans `docs/diagrams/` (`.excalidraw` source, `.png` rendu, `.py`
  regenere via le skill `excalidraw-diagrams`), mirrores dans un document Linear
  par domaine. Rafraichis quand la feature qui change le flux merge.
- **Fin de session** : recap dans `#ravito-daily-log`, et tenir a jour le
  document Linear "Session Handoff" (le contexte ne suit pas entre machines).
- **Pair-programming** : setup outillage/infra -> Claude autonome ; code coeur
  du projet -> petits pas, expliquer le *pourquoi*, l'utilisateur pilote et
  reagit plutot que d'avaler un gros scaffold non supervise.

## Decoupage en lots (= milestones Linear)

### Lot 0 - Setup projet
- Repo depuis le template ; adapter `<PREFIX>`, README, CONTRIBUTING, Makefile.
- Monorepo `backend/` (NestJS) + `frontend/` (Vite) + `docker-compose.yml`.
- Backend : `nest new`, Prisma init, `prisma/schema.prisma` vide + connexion PG,
  `pino` logger, `/healthz`, config `@nestjs/config` + validation d'env.
- Frontend : `create vite` (React+TS), TanStack Router + Query, `vite-plugin-pwa`
  (manifest + SW), config eslint/prettier reprise de `vacation_picker`.
- CI `.github/workflows/` : format / lint / typecheck / test / build pour les
  deux packages + gitleaks. `.env.example` a jour.
- ADR 0001 : "Stack et ORM" (React/TanStack + NestJS + Prisma, PWA).
- Diagramme `docs/diagrams/architecture` (contexte C4 niveau 1-2).

### Lot 1 - Auth & Foyer
- Prisma : `User`, `Household`, `HouseholdMember`, `HouseholdInvite`, `AuditLog`
  + migration initiale.
- ADR 0002 : strategie d'auth (JWT access+refresh recommande, cookie httpOnly
  pour le refresh).
- Endpoints : `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`,
  `POST /auth/logout`, `GET /me`.
- Foyer : `POST /households` (cree + rend l'appelant OWNER),
  `POST /households/:id/invites`, `POST /households/join` (par code),
  `GET /households/:id/members`, `DELETE /households/:id/members/:userId`.
- `HouseholdMembershipGuard` + tests des policies (un membre du foyer A ne voit
  rien du foyer B).
- Front : ecrans Login / Register, ecran Foyer (creer, code d'invitation,
  rejoindre, membres), gestion du token via TanStack Query + refresh
  automatique.
- `web-security-review` avant merge. Test e2e des flows d'auth.
- Diagramme `docs/diagrams/auth` + doc Linear "Auth - architecture".

### Lot 2 - Inventaire
- Prisma : `Product`, `InventoryItem` + migration.
- Endpoints CRUD `products` et `inventory` (tous derriere le guard).
- Front : ecran Inventaire (liste groupee par categorie, +/- quantite,
  suppression), "Ajout rapide" (champ texte -> recherche dans `products` du
  foyer -> creation a la volee si absent).
- Tests service + e2e d'un parcours d'ajout.

### Lot 3 - Liste de courses partagee (temps reel)
- Prisma : `ShoppingListItem` + migration.
- Endpoints CRUD + `PATCH /shopping-list/:id/check`.
- **WebSocket gateway** : room par `householdId`, events `item.created`,
  `item.updated`, `item.deleted` ; le front s'y abonne et met a jour le cache
  TanStack Query (mise a jour optimiste + reconciliation).
- ADR 0003 : transport temps reel (WebSocket vs SSE vs polling).
- Front : ecran Liste (ajout libre ou depuis catalogue, cocher/decocher,
  reordonner), badge de presence des autres membres (optionnel).
- Regle activable "article coche -> +quantite dans l'inventaire" ; action "vider
  les articles coches".
- Tests : gateway (2 clients simules), e2e du parcours a 2 comptes.
- Diagramme `docs/diagrams/shopping-list-realtime`.

### Lot 4 - Finitions socle
- Prisma : `PurchaseHistory` + endpoint de saisie manuelle rapide.
- Autocomplete enrichi par frequence d'ajout (`PurchaseHistory`).
- Hors-ligne minimal : cache TanStack Query persiste
  (`@tanstack/query-persist-client`) + file d'attente d'ecritures rejouee a la
  reconnexion ; SW pour le shell de l'app.
- Ecran Historique d'achats (amorce du futur import tickets).

## Backlog (hors perimetre v1)

1. **Import ticket** - d'abord commandes drive (PDF / e-mail structure), puis OCR
   photo (Google Vision / Textract) + parsing par enseigne + mapping
   `rawLabel -> productId` avec apprentissage. Alimente `PurchaseHistory` et
   `InventoryItem`. Probable service dedie + queue (BullMQ).
2. **Rangement par rayon** - ordre de parcours du magasin, tri de la liste.
3. **Menus -> liste** - recettes de la semaine, quantites, deduction du stock.
4. **Suivi prix / promos** - multi-enseignes, historique du prix paye.
5. **Peremption** - `expiresAt` + notifications push.
6. **Passage SaaS** - Stripe + plans/quotas, onboarding self-service durci,
   RGPD, rate-limiting, observabilite complete.

## Fichiers / elements cles

- `backend/prisma/schema.prisma` - modele de donnees
- `backend/src/<domain>/` - un module NestJS par domaine (voir archi)
- `backend/src/common/guards/household-membership.guard.ts` - isolation tenant
- `backend/src/shopping-list/shopping-list.gateway.ts` - WebSocket
- `frontend/src/routes/` - arbre TanStack Router
- `frontend/src/lib/api.ts` + `frontend/src/lib/query-client.ts` - client + cache
- `frontend/vite.config.ts` - `vite-plugin-pwa`
- `docs/adr/*.md`, `docs/diagrams/*` - decisions + diagrammes
- Config reprise de `vacation_picker` : eslint, prettier, husky, CI shape
  (`npm --prefix`)

## Verification (bout en bout)

1. `make up` (ou `docker-compose up`) lance db + backend + frontend.
2. Migrations / isolation : `prisma migrate reset` puis tests d'integration -
   un membre du foyer A n'accede a aucune donnee du foyer B (guard + requetes).
3. Parcours manuel sur 2 navigateurs (ou tel + desktop), 2 comptes du meme
   foyer :
   - compte 1 cree le foyer, genere un code ; compte 2 rejoint via le code.
   - compte 1 ajoute "Lait" a la liste -> apparait chez compte 2 en < 1 s
     (WebSocket).
   - compte 2 coche "Lait" -> case cochee chez compte 1, et "Lait" apparait
     dans l'inventaire.
   - hors-ligne : couper le reseau du compte 2, cocher un article, retablir ->
     la modif se synchronise.
   - installer la PWA sur mobile ("ajouter a l'ecran d'accueil"), verifier le
     lancement plein ecran et le shell hors-ligne.
4. `make format lint typecheck test` vert pour les deux packages ; CI verte sur
   la PR ; `/code-review` passe ; `web-security-review` OK sur les lots 1-3.
5. Statuts Linear : ouverture de branche -> *In Progress*, merge PR -> *Done* ;
   notifs visibles dans `#ravito-git-github` et `#ravito-linear`.
