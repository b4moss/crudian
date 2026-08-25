.PHONY: help tree \
	docker-build docker-up docker-down docker-shell docker-check docker-ps

COMPOSE := docker compose -f docker/compose.yaml

help:
	@echo "Crudian monorepo"
	@echo ""
	@echo "Targets:"
	@echo "  make tree           Show package layout"
	@echo "  make docker-build   Build the all-in-one runtime image"
	@echo "  make docker-up      Start runtime + Postgres / MySQL / MariaDB"
	@echo "  make docker-down    Stop compose stack"
	@echo "  make docker-shell   Shell into the all-in-one runtime container"
	@echo "  make docker-check   Verify Node 24 / Bun / Go 1.26 (+ PHP) in the image"
	@echo "  make docker-ps      Show compose service status"

tree:
	@find docs packages docker .devcontainer -print | sort

docker-build:
	$(COMPOSE) build dev

docker-up:
	$(COMPOSE) up -d --build

docker-down:
	$(COMPOSE) down

docker-shell:
	$(COMPOSE) run --rm --service-ports dev bash

docker-check:
	$(COMPOSE) run --rm --no-deps dev check-runtimes

docker-ps:
	$(COMPOSE) ps
