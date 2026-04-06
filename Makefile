.PHONY: up down build logs migrate seed shell-backend shell-db dev prod watch

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

migrate:
	docker compose exec backend alembic upgrade head

seed:
	docker compose exec backend python seed_defect_types.py

shell-backend:
	docker compose exec backend bash

shell-db:
	docker compose exec postgres psql -U inspector -d inspector

# Dev mode: Vite dev server with HMR on localhost:5173 + file sync watch
dev:
	docker compose -f docker-compose.yml -f docker-compose.override.yml up --build -d && \
	docker compose -f docker-compose.yml -f docker-compose.override.yml watch

# Dev mode with watch only (if containers already running)
watch:
	docker compose -f docker-compose.yml -f docker-compose.override.yml watch

# Production mode: Nginx static build on localhost:80
prod:
	docker compose up

clean:
	docker compose down -v
