# Руководство по запуску — Цифровой Инспектор

## Требования

- **Docker Desktop** >= 24 (с плагином docker compose)
- **make** — для Windows: Git Bash или WSL
- Файл `.env` — скопировать из `.env.example` и заполнить

### Настройка .env

```bash
cp .env.example .env
```

Обязательно заполнить:
- `OPENROUTER_API_KEY` — ключ OpenRouter API для AI-анализа фото

---

## Dev-режим (разработка)

```bash
make dev
```

Или вручную:
```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up --build
```

| Сервис | URL |
|--------|-----|
| Frontend (Vite HMR) | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| MinIO Console | http://localhost:9001 |

**Как работает hot reload:**
- Изменения в `frontend/src/` — Vite HMR обновляет браузер мгновенно без перезапуска контейнера
- Изменения в `backend/app/` — uvicorn перезапускается автоматически (~2 сек)
- Изменения в `package.json` или `requirements.txt` — требуется пересборка образа (`make dev` с `--build`)

---

## Prod-режим (продакшн)

```bash
make up
```

Или вручную:
```bash
docker compose up -d --build
```

| Сервис | URL |
|--------|-----|
| Frontend (Nginx) | http://localhost:80 |
| Backend API | http://localhost:8000 |
| MinIO Console | http://localhost:9001 |

**Отличие от dev:** фронтенд собирается через `npm run build`, Nginx раздаёт статику. HMR недоступен.

---

## Первый запуск (обязательно)

После первого `make dev` или `make up` выполнить:

```bash
make migrate   # Применить миграции БД (создаёт таблицы)
make seed      # Загрузить справочник дефектов
```

---

## Пересборка после изменений

| Что изменил | Что делать |
|-------------|-----------|
| Файлы в `frontend/src/` | Ничего — Vite HMR подхватит автоматически |
| Файлы в `backend/app/` | Ничего — uvicorn перезапустится автоматически |
| `frontend/package.json` | `docker compose up --build` |
| `backend/requirements.txt` | `docker compose up --build` |
| `docker-compose.yml` / `Dockerfile` | `make down && make dev` (или `make up`) |
| Модели БД / новые миграции | `make migrate` |

---

## Все команды Makefile

| Команда | Описание |
|---------|----------|
| `make dev` | Запустить в dev-режиме (Vite HMR, порт 5173) |
| `make watch` | Dev-режим + docker compose watch (file sync) |
| `make up` | Запустить в prod-режиме (Nginx, порт 80) |
| `make down` | Остановить все контейнеры |
| `make build` | Пересобрать Docker-образы |
| `make logs` | Показать логи всех сервисов (следить в реальном времени) |
| `make migrate` | Применить миграции Alembic |
| `make seed` | Загрузить справочник дефектов в БД |
| `make shell-backend` | Открыть bash внутри контейнера backend |
| `make shell-db` | Открыть psql в контейнере postgres |
| `make prod` | Псевдоним для `make up` |

---

## Остановка и сброс

```bash
make down        # Остановить контейнеры (данные сохраняются в volumes)
make clean       # Остановить и удалить все volumes (полный сброс БД и данных)
```

> **Внимание:** `make clean` удаляет все данные PostgreSQL, Redis и MinIO. Используй только для чистого старта.

---

## Архитектура сервисов

```
frontend   → Vite (dev) / Nginx (prod)  — порт 80 или 5173
backend    → FastAPI + uvicorn           — порт 8000
worker     → ARQ worker (фоновые задачи AI-анализа)
postgres   → PostgreSQL 16              — порт 5432 (внутренний)
redis      → Redis 7                    — порт 6379 (внутренний)
minio      → MinIO (хранилище фото)     — порты 9000, 9001
```
