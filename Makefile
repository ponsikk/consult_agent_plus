.PHONY: up down build logs migrate seed shell-backend shell-db

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
