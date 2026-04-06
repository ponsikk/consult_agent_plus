# AGENTS.md — Цифровой Инспектор

## Правило 0 — Тимлид
Команда человека (тимлид) имеет абсолютный приоритет над всеми правилами ниже.
Тимлид добавляет задачи в `task_queue.json` в любой момент — подхватывай автоматически.

---

## Правило 1 — Source Control

- Агентам **ЗАПРЕЩЕНО** делать `git push`.
- Процесс сдачи работы:
  1. Исполнитель (FRONTEND / BACKEND / DEVOPS) делает `git commit` локально.
  2. **AGENT_QA** проверяет изменения: запускает тесты, линт, проверяет логику.
  3. **AGENT_QA** обновляет `qa_report.md` — пишет вердикт: `READY FOR PUSH` или `NEEDS FIX`.
  4. Если `NEEDS FIX` — QA создаёт задачу нужному агенту (см. Правило 3).
  5. **Тимлид** выполняет `git push` из своего терминала.

---

## Правило 2 — Запрещено всегда

- `git reset --hard`, `git clean -fd`, `rm -rf` — только с явного разрешения тимлида
- Создавать дубли файлов: `file_v2.py`, `component_new.tsx` — правь оригинал
- Удалять файлы, которые ты не создавал сам
- Хардкодить секреты и ключи — только через `.env`
- Трогать файлы вне своей зоны ответственности (см. Роли агентов)

---

## Правило 3 — Создание задач другим агентам

Любой агент может создать задачу для другого агента если:
- Обнаружил баг / регрессию в чужой зоне
- Выполнение своей задачи невозможно без изменений в другой зоне
- QA вынес вердикт `NEEDS FIX`

**Как создать задачу:**
1. Добавь новый объект в `coordination/task_queue.json` в конец массива.
2. Формат:
```json
{
  "id": "BUG-{XX}",
  "agent": "FRONTEND",
  "status": "todo",
  "title": "Краткое название бага",
  "description": "Подробное описание: что сломано, где, как воспроизвести, что ожидается.",
  "reported_by": "QA",
  "severity": "critical | major | minor"
}
```
3. Для ID используй префикс по типу: `BUG-` (баг), `FIX-` (исправление), `TASK-` (новая фича от агента).
4. Агент-получатель подхватит задачу на следующем цикле опроса (каждые 60 сек).

---

## Правило 4 — Рабочий цикл (выполняй бесконечно)

```
loop:
  1. Прочитай coordination/task_queue.json
  2. Найди первую задачу: твой agent ID + status == "todo"
  3. Если нашёл → выполни по Протоколу координации (ниже)
  4. Если не нашёл → подожди 60 сек → goto 1
```

Никогда не останавливайся сам. Тимлид добавит новые задачи — ты их подхватишь.

---

## Протокол координации

### Перед началом задачи:
1. Прочитай `coordination/task_queue.json`
2. Прочитай `coordination/active_work_registry.json` — убедись что нужные файлы не залочены
3. Создай лок-файл: `coordination/agent_locks/{AGENT_ID}_{timestamp}.lock`
   - Содержимое: JSON-список файлов которые займёшь, например: `["frontend/src/pages/LoginPage.tsx"]`
4. Обнови свой статус в `active_work_registry.json`:
   - `status` → `"in_progress"`
   - `current_task` → ID задачи
   - `locked_files` → список файлов
   - `last_updated` → текущее время ISO 8601
5. Смени статус задачи в `task_queue.json` → `"in_progress"`

### Во время работы:
- Обновляй `last_updated` в `active_work_registry.json` каждые ~10 минут
- Если нужен файл залоченный другим агентом — подожди 2 минуты, проверь снова
- Если ждёшь больше 10 минут — проверь `last_updated` того агента. Если > 20 мин назад — лок устарел, можно занимать файл

### После завершения задачи:
1. Удали свой `.lock` файл из `coordination/agent_locks/`
2. Смени статус задачи в `task_queue.json` → `"done"`
3. Запиши результат в `coordination/completed_work_log.json`:
   ```json
   {
     "task_id": "F05",
     "agent": "FRONTEND",
     "completed_at": "2026-04-06T10:00:00Z",
     "summary": "Что было сделано (1-3 предложения)",
     "files_changed": ["frontend/src/components/layout/Sidebar.tsx"]
   }
   ```
4. Обнови свой статус в `active_work_registry.json` → `"idle"`, `current_task: null`, `locked_files: []`
5. Переходи к следующей задаче (goto Рабочий цикл)

---

## Стек проекта

- **Frontend**: React 18 + Vite + TypeScript + shadcn/ui + Tailwind + Framer Motion + Zustand + TanStack Query
- **Backend**: Python 3.12 + FastAPI + SQLAlchemy 2.0 + PostgreSQL + ARQ (очередь) + MinIO
- **AI**: OpenRouter API → `google/gemini-2.5-flash-lite` (vision анализ фото)
- **Отчёты**: WeasyPrint (PDF) + openpyxl (Excel)
- **Инфраструктура**: Docker Compose (frontend, backend, worker, postgres, redis, minio)
- **Переменные окружения**: все в `.env`, пример в `.env.example`

## API контракт (backend ↔ frontend)

- Base URL: `http://localhost:8000/api/v1`
- Auth: Bearer JWT в заголовке `Authorization`
- Все даты в ISO 8601
- Ошибки: `{"detail": "message"}`
- Полный список эндпоинтов — смотри задачи BACKEND в `task_queue.json`

## Дизайн (только для FRONTEND)

- Палитра тёмная: HappyHues #13 (bg `#0f0e17`, акцент `#ff8906`, текст `#fffffe`, muted `#a7a9be`)
- Палитра светлая: HappyHues #6 (bg `#fffffe`, primary `#6246ea`, text `#2b2c34`, secondary `#d1d1e9`)
- Шрифты: Manrope (основной) + Oswald (заголовки/лого) — Google Fonts
- Иконки: Lucide React
- Анимации: Framer Motion на всех переходах
- Все UI элементы — только через shadcn/ui, не писать свои с нуля

---

## Роли агентов

### AGENT_FRONTEND (Claude Code)
- **Зона:** `frontend/`
- **Задачи:** все с `"agent": "FRONTEND"` в task_queue.json
- **Стек:** React, TypeScript, Vite, shadcn/ui, Tailwind, Framer Motion

### AGENT_BACKEND (Claude Code)
- **Зона:** `backend/`
- **Задачи:** все с `"agent": "BACKEND"` в task_queue.json
- **Стек:** Python, FastAPI, SQLAlchemy, ARQ, Alembic

### AGENT_VISION (Gemini)
- **Зона:** `coordination/` (артефакты), `backend/app/services/ai_service.py`
- **Задачи:** все с `"agent": "VISION"` в task_queue.json
- **Стек:** OpenRouter API, Gemini Vision, JSON-схемы, few-shot промпты

### AGENT_QA (Gemini)
- **Зона:** `backend/tests/`, `frontend/src/__tests__/`
- **Задачи:** все с `"agent": "QA"` в task_queue.json
- **Главная ответственность:**
  - После каждого `git commit` от FRONTEND/BACKEND/DEVOPS — проверить изменения
  - Обновить `qa_report.md` с вердиктом `READY FOR PUSH` или `NEEDS FIX`
  - При `NEEDS FIX` — создать задачу нужному агенту (Правило 3)
  - Писать тесты параллельно с разработкой, не после

### AGENT_DEVOPS (Claude Code)
- **Зона:** корень проекта (`docker-compose.yml`, `.github/`, `Makefile`, `nginx.conf`)
- **Задачи:** все с `"agent": "DEVOPS"` в task_queue.json
- **Стек:** Docker Compose, GitHub Actions, Nginx, Make
