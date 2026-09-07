# ---------------------------------------------------------------------------- #
# Configuration                                                                #
# ---------------------------------------------------------------------------- #

# Auto-detect the compose CLI: prefer the Docker Compose v2 plugin, fall
# back to podman-compose on machines that only have that (e.g. a school
# Podman setup). Override explicitly if needed, e.g. `make COMPOSE=podman-compose up`.
COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "podman-compose")

# The plain container CLI (for label-scoped cleanup that compose can't do
# portably): `docker` when the Compose v2 plugin is present, `podman` otherwise.
CONTAINER := $(if $(filter docker,$(firstword $(COMPOSE))),docker,podman)

# Compose derives the project name from the directory name; volumes are then
# named `<project>_<key>` on both docker compose and podman-compose.
PROJECT := $(notdir $(CURDIR))

.PHONY: help \
        install install-backend install-frontend hooks-install \
        dev-backend dev-frontend \
        up down ps re \
        logs logs-backend logs-frontend logs-db \
        sh-backend sh-frontend psql be fe \
        clean fclean wipe-db \
        format format-backend format-frontend \
        format-check format-check-backend format-check-frontend \
        lint lint-backend lint-frontend \
        lint-check lint-check-backend lint-check-frontend \
        typecheck typecheck-backend typecheck-frontend \
        test build doc

help:
	@echo "Setup"
	@echo "  install         - install backend + frontend dependencies, set up git hooks"
	@echo ""
	@echo "Local dev (no containers)"
	@echo "  dev-backend     - backend in watch mode; needs a reachable DATABASE_URL"
	@echo "                    (PrismaService connects eagerly at boot, and the db"
	@echo "                    isn't exposed to the host) - use 'make up' instead"
	@echo "                    unless you have your own local Postgres"
	@echo "  dev-frontend    - frontend dev server (no DB needed)"
	@echo ""
	@echo "Container stack"
	@echo "  up              - compose up -d (db + backend + frontend)"
	@echo "  down            - compose down"
	@echo "  ps              - compose ps"
	@echo "  re              - fclean then up (full reset)"
	@echo "  logs[-backend|-frontend|-db]  - follow logs (all services, or one)"
	@echo "  sh-backend      - interactive shell in the backend container"
	@echo "  sh-frontend     - interactive shell in the frontend container"
	@echo "  psql            - psql prompt on the dev database"
	@echo "  be CMD=\"...\"     - run a command in the backend container (e.g. npx tsc --noEmit)"
	@echo "  fe CMD=\"...\"     - run a command in the frontend container"
	@echo ""
	@echo "Cleanup"
	@echo "  clean           - stop and remove containers (keeps volumes + images)"
	@echo "  fclean          - clean + remove volumes (db, node_modules) and locally-built images"
	@echo "  wipe-db         - remove only the db container + its data volume (fast schema reset)"
	@echo ""
	@echo "Code quality (host-side)"
	@echo "  format[-check]   - Prettier, write (or check only) on backend + frontend"
	@echo "  lint[-check]     - ESLint, --fix (or check only) on backend + frontend"
	@echo "  typecheck        - tsc on backend + frontend"
	@echo "  test             - backend unit + e2e tests"
	@echo "  build            - production build, backend + frontend"
	@echo "  doc              - generate backend code docs (Compodoc) into docs/backend"

# ---------------------------------------------------------------------------- #
# Setup                                                                        #
# ---------------------------------------------------------------------------- #

install: install-backend install-frontend hooks-install

install-backend:
	cd backend && npm install
	# npm's install-scripts allowlist blocks @prisma/client's postinstall
	# (see docs/lessons.md) - generate explicitly or the client stays
	# untyped until something else happens to run this. `generate` never
	# connects to the database, but prisma.config.ts still requires
	# DATABASE_URL to be set to *something* - this runs before `.env`
	# necessarily exists yet (see CONTRIBUTING.md's fresh-clone order).
	cd backend && DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate

install-frontend:
	cd frontend && npm install

hooks-install:
	git config core.hooksPath .githooks

# ---------------------------------------------------------------------------- #
# Local dev (no containers)                                                    #
# ---------------------------------------------------------------------------- #

dev-backend:
	cd backend && npm run start:dev

dev-frontend:
	cd frontend && npm run dev

# ---------------------------------------------------------------------------- #
# Container stack - lifecycle                                                  #
# ---------------------------------------------------------------------------- #

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

ps:
	$(COMPOSE) ps

re: fclean up

# ---------------------------------------------------------------------------- #
# Container stack - logs                                                       #
# ---------------------------------------------------------------------------- #

logs:
	$(COMPOSE) logs -f

logs-backend:
	$(COMPOSE) logs -f backend

logs-frontend:
	$(COMPOSE) logs -f frontend

logs-db:
	$(COMPOSE) logs -f db

# ---------------------------------------------------------------------------- #
# Container stack - run commands inside a running service (`make up` first)    #
# ---------------------------------------------------------------------------- #

sh-backend:
	$(COMPOSE) exec backend sh

sh-frontend:
	$(COMPOSE) exec frontend sh

# psql prompt on the dev database, using the container's own credentials.
psql:
	$(COMPOSE) exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

# Run an arbitrary command in a service, e.g.
#   make be CMD="npx tsc --noEmit"
#   make be CMD="npm run lint"
#   make fe CMD="npm run build"
be:
	$(COMPOSE) exec backend $(CMD)

fe:
	$(COMPOSE) exec frontend $(CMD)

# ---------------------------------------------------------------------------- #
# Container stack - cleanup                                                    #
# ---------------------------------------------------------------------------- #

# Stop and remove containers. Volumes (the database) and images are kept.
clean:
	$(COMPOSE) down --remove-orphans

# Also drop volumes (db_data + the node_modules volumes) and images built
# locally. `--rmi local` leaves pulled images like postgres:16-alpine alone,
# so the next `up` doesn't re-download them.
fclean:
	$(COMPOSE) down --volumes --remove-orphans --rmi local

# Reset just the database. `down` (no --volumes) removes every container but
# keeps all named volumes, so we then drop only db_data by name (portable:
# compose names volumes `<project>_db_data` on both docker and podman-compose).
# Much faster than fclean: the node_modules volumes and built images stay, so
# the next `up` needs no rebuild or npm ci - only the containers and a fresh
# database are recreated. `-` lets it pass when the volume isn't there.
wipe-db:
	$(COMPOSE) down
	-$(CONTAINER) volume rm $(PROJECT)_db_data
	@echo "Database gone. 'make up' recreates a fresh one."

# ---------------------------------------------------------------------------- #
# Code quality - run on the host (fast; matches what the pre-commit hook uses) #
# ---------------------------------------------------------------------------- #

format: format-backend format-frontend

format-backend:
	cd backend && npm run format

format-frontend:
	cd frontend && npm run format

format-check: format-check-backend format-check-frontend

format-check-backend:
	cd backend && npm run format:check

format-check-frontend:
	cd frontend && npm run format:check

lint: lint-backend lint-frontend

lint-backend:
	cd backend && npm run lint

lint-frontend:
	cd frontend && npm run lint

lint-check: lint-check-backend lint-check-frontend

lint-check-backend:
	cd backend && npm run lint:check

lint-check-frontend:
	cd frontend && npm run lint:check

typecheck: typecheck-backend typecheck-frontend

typecheck-backend:
	cd backend && npm run typecheck

typecheck-frontend:
	cd frontend && npm run typecheck

# ---------------------------------------------------------------------------- #
# Test / build / docs                                                          #
# ---------------------------------------------------------------------------- #

test:
	cd backend && npm run test
	cd backend && npm run test:e2e

build:
	cd backend && npm run build
	cd frontend && npm run build

doc:
	cd backend && npm run doc
