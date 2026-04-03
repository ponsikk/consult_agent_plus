# AGENTS.md — Цифровой Инспектор

## Правило 0
Команда человека (тимлид) имеет абсолютный приоритет над всеми правилами ниже.

## Запрещено всегда
- `git reset --hard`, `git clean -fd`, `rm -rf` — никогда без явного разрешения тимлида
- Создавать `file_v2.py`, `component_new.tsx` и подобные дубли — правь оригинал
- Удалять файлы которые ты не создавал сам
- Хардкодить секреты и ключи — только через `.env`

## Протокол координации

### Перед началом задачи:
1. Прочитай `coordination/task_queue.json`
2. Прочитай `coordination/active_work_registry.json` — убедись что нужные файлы не залочены
3. Создай лок: `coordination/agent_locks/{AGENT_ID}_{timestamp}.lock` (список файлов которые займёшь)
4. Обнови свой статус в `active_work_registry.json` → `"in_progress"`
5. Смени статус задачи в `task_queue.json` → `"in_progress"`

### Во время работы:
- Обновляй `last_updated` в `active_work_registry.json` каждые ~10 минут
- Если нужен файл который залочен другим агентом — подожди 2 минуты, проверь снова

### После завершения задачи:
- Удали свой `.lock` файл
- Смени статус задачи в `task_queue.json` → `"done"`
- Запиши результат в `coordination/completed_work_log.json`
- Обнови свой статус в `active_work_registry.json` → `"idle"`
- Возьми следующую задачу со своим `agent` ID

---

## Стек проекта
- **Frontend**: React 18 + Vite + TypeScript + shadcn/ui + Tailwind + Framer Motion + Zustand + TanStack Query
- **Backend**: Python 3.12 + FastAPI + SQLAlchemy 2.0 + PostgreSQL + ARQ (очередь) + MinIO
- **AI**: OpenRouter API → `google/gemini-2.5-flash-lite` (vision анализ фото)
- **Отчёты**: WeasyPrint (PDF) + openpyxl (Excel)
- **Инфраструктура**: Docker Compose (frontend, backend, worker, postgres, redis, minio)
- **Переменные**: все в `.env`, пример в `.env.example`

## API контракт (backend ↔ frontend)
- Base URL: `http://localhost:8000/api/v1`
- Auth: Bearer JWT в заголовке `Authorization`
- Все даты в ISO 8601
- Ошибки: `{"detail": "message"}`
- Полный список эндпоинтов — читай `coordination/task_queue.json` задачи BACKEND

## Дизайн (только для FRONTEND)
- Палитра: HappyHues Palette #13 тёмная (bg `#0f0e17`, акцент `#ff8906`, текст `#fffffe`, muted `#a7a9be`)
- Светлая тема: HappyHues Palette #11 (bg `#fef6e4`, primary `#f582ae`)
- Шрифты: Manrope (основной) + Oswald (заголовки/лого) — Google Fonts
- Иконки: Lucide React
- Анимации: Framer Motion на всех переходах
- Все UI элементы только через shadcn/ui

---

## Роли агентов

### AGENT_FRONTEND (Claude Code)
Зона: `frontend/`
Задачи: все с `"agent": "FRONTEND"` в task_queue.json

### AGENT_BACKEND (Claude Code)
Зона: `backend/`
Задачи: все с `"agent": "BACKEND"` в task_queue.json

### AGENT_VISION (Gemini)
Зона: `coordination/` (пишет артефакты), `backend/app/services/ai_service.py`
Задачи: все с `"agent": "VISION"` в task_queue.json

### AGENT_QA (Gemini)
Зона: `backend/tests/`, `frontend/src/__tests__/`
Задачи: все с `"agent": "QA"` в task_queue.json
Начинай работу когда в `completed_work_log.json` есть хотя бы B02 и F01

### AGENT_DEVOPS (Claude Code)
Зона: корень проекта (`docker-compose.yml`, `.github/`, `Makefile`, `nginx.conf`)
Задачи: все с `"agent": "DEVOPS"` в task_queue.json
