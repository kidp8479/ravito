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
        install install-backend hooks-install \
        dev-backend dev-frontend \
        up down ps re \
        logs logs-backend logs-frontend logs-db \
        sh-backend sh-frontend psql be fe \
        clean fclean wipe-db \
        format format-check \
        lint lint-check \
        typecheck \
        test build doc

help:
	@echo "Setup"
	@echo "  install         - install dependencies, set up git hooks"
	@echo ""
	@echo "Local dev (no containers)"
	@echo "  dev-backend     - backend in watch mode, NO DATABASE (db isn't exposed to"
	@echo "                    the host - use 'make up' for anything touching Postgres)"
	@echo "  dev-frontend    - frontend dev server (TODO: wire to real script)"
	@echo ""
	@echo "Container stack"
	@echo "  up              - compose up -d"
	@echo "  down            - compose down"
	@echo "  ps              - compose ps"
	@echo "  re              - fclean then up (full reset)"
	@echo "  logs[-backend|-frontend|-db]  - follow logs (all services, or one)"
	@echo "  sh-backend      - interactive shell in the backend container"
	@echo "  sh-frontend     - interactive shell in the frontend container"
	@echo "  psql            - psql prompt on the dev database"
	@echo "  be CMD=\"...\"     - run a command in the backend container"
	@echo "  fe CMD=\"...\"     - run a command in the frontend container"
	@echo ""
	@echo "Cleanup"
	@echo "  clean           - stop and remove containers (keeps volumes + images)"
	@echo "  fclean          - clean + remove volumes and locally-built images"
	@echo "  wipe-db         - remove only the db container + its data volume (fast schema reset)"
	@echo ""
	@echo "Code quality (host-side)"
	@echo "  format[-check]   - format, write (or check only)"
	@echo "  lint[-check]     - lint, --fix (or check only)"
	@echo "  typecheck        - tsc --noEmit (or equivalent)"
	@echo "  test             - run tests"
	@echo "  build            - production build"
	@echo "  doc              - generate code docs"

# ---------------------------------------------------------------------------- #
# Setup                                                                        #
# ---------------------------------------------------------------------------- #

install: install-backend hooks-install
	# TODO (next branch): install-frontend, once frontend/ exists.

install-backend:
	cd backend && npm install

hooks-install:
	git config core.hooksPath .githooks

# ---------------------------------------------------------------------------- #
# Local dev (no containers)                                                    #
# ---------------------------------------------------------------------------- #

dev-backend:
	cd backend && npm run start:dev

dev-frontend:
	# TODO: e.g. cd frontend && npm run dev

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
# Assumes a `db` service with POSTGRES_USER/POSTGRES_DB env vars - adjust
# if the project uses a different database.
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

# Also drop volumes (db data, node_modules) and images built locally.
# `--rmi local` leaves pulled base images alone so the next `up` doesn't
# re-download them.
fclean:
	$(COMPOSE) down --volumes --remove-orphans --rmi local

# Reset just the database. `down` (no --volumes) removes every container
# but keeps all named volumes, so we then drop only the db volume by name
# (portable: compose names volumes `<project>_<key>` on both docker and
# podman-compose). Much faster than fclean - node_modules volumes and
# built images stay, so the next `up` needs no rebuild or reinstall.
# TODO: adjust `db_data` below if the db volume has a different name.
wipe-db:
	$(COMPOSE) down
	-$(CONTAINER) volume rm $(PROJECT)_db_data
	@echo "Database gone. 'make up' recreates a fresh one."

# ---------------------------------------------------------------------------- #
# Code quality - run on the host (fast; matches what the pre-commit hook uses) #
# ---------------------------------------------------------------------------- #

# TODO (next branch): extend each target below to also run in frontend/,
# once it exists (see 42_hypertube's Makefile for the -backend/-frontend
# split to mirror).

format:
	cd backend && npm run format

format-check:
	cd backend && npm run format:check

lint:
	cd backend && npm run lint

lint-check:
	cd backend && npm run lint:check

typecheck:
	cd backend && npm run typecheck

test:
	cd backend && npm run test

build:
	cd backend && npm run build

doc:
	cd backend && npm run doc
