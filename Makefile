.PHONY: up down build logs migrate seed shell-backend shell-db dev prod

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

# Dev mode: volume mounts → instant HMR without docker compose watch
# Frontend: localhost:5173 (Vite dev server, changes visible immediately)
# Backend:  localhost:8000 (uvicorn --reload)
dev:
	docker compose -f docker-compose.yml -f docker-compose.override.yml up --build

# Production mode: Nginx static build on localhost:80
prod:
	docker compose up --build

clean:
	docker compose down -v
