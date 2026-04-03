# Цифровой Инспектор — Архитектура проекта

## Описание продукта
ИИ-агент на базе LLM для анализа фотографий строительных объектов.
Автоматически выявляет дефекты, классифицирует по типу/критичности/нормативам (СП, СНиП, ГОСТ),
генерирует отчёты PDF/Excel/JSON с визуализацией дефектов (bounding boxes).

## Пользователи
- Служба технадзора
- Подрядчики и субподрядчики

## Структура проекта

```
inspector/
├── frontend/              # React 18 + Vite + TS + shadcn/ui
├── backend/               # Python 3.12 + FastAPI + PostgreSQL
├── AGENTS/                # TZ для каждого агента
├── MESSAGES/              # Межагентная коммуникация (файлы)
├── docker-compose.yml     # Все сервисы
└── .github/workflows/     # CI/CD
```

## Стек технологий

### Frontend
- React 18 + Vite + TypeScript
- shadcn/ui + Tailwind CSS
- Zustand (глобальный стейт)
- React Query / TanStack Query (сервер-стейт)
- Framer Motion (анимации)
- Lucide React (иконки)
- Axios (HTTP)

### Backend
- Python 3.12 + FastAPI
- SQLAlchemy 2.0 + Alembic (миграции)
- PostgreSQL 16
- ARQ (async task queue поверх Redis)
- MinIO (S3-совместимое хранилище фото)
- WeasyPrint (PDF генерация)
- openpyxl (Excel генерация)
- Pillow (обработка изображений, рисование bounding boxes)

### AI / Vision
- OpenRouter API
- Основная модель: `google/gemini-2.0-flash-001` (vision, анализ фото)
- Вспомогательная: `anthropic/claude-3.5-sonnet` (структурирование отчётов)

### Инфраструктура
- Docker + Docker Compose
- PostgreSQL 16
- Redis 7
- MinIO (S3)
- Nginx (reverse proxy, опционально)

## API контракт (ключевые endpoints)

```
POST   /api/v1/analyses              — создать анализ (multipart: photos[] + metadata)
GET    /api/v1/analyses              — список анализов (пагинация)
GET    /api/v1/analyses/{id}         — результат анализа
GET    /api/v1/analyses/{id}/status  — статус: pending / processing / done / error
GET    /api/v1/analyses/{id}/report/pdf
GET    /api/v1/analyses/{id}/report/excel
GET    /api/v1/defects/catalog       — справочник типов дефектов
POST   /api/v1/auth/login
POST   /api/v1/auth/register
GET    /api/v1/auth/me
```

Полный API spec: см. `API_SPEC.md`

## Схема данных (ключевые сущности)

```
User: id, email, password_hash, full_name, role, created_at

Analysis: id, user_id, object_name, shot_date, status, created_at, completed_at
  → has many: AnalysisPhoto, AnalysisReport

AnalysisPhoto: id, analysis_id, original_url, annotated_url, order_index
  → has many: Defect

Defect: id, photo_id, defect_type_id, criticality, bbox_x, bbox_y, bbox_w, bbox_h,
         description, consequences, norm_references, recommendations

DefectType: id, system (кровля/фасады/водоснабжение/теплоснабжение), name, code

AnalysisReport: id, analysis_id, pdf_url, excel_url, summary_json
```

## Классификация дефектов (справочник)

Системы: Кровля (плоская), Кровля (шиферная), Фасады, Водоснабжение, Теплоснабжение

Критичность: `critical` | `significant` | `minor`

## Межагентная коммуникация

Когда агент заблокирован и нужно что-то от другого агента:
1. Создать файл `MESSAGES/agent_X_to_agent_Y_YYYYMMDD_HHMMSS.md`
2. Тимлид (человек) передаёт информацию нужному агенту

## Порядок разработки
1. Agent 3 (Vision/AI) → финализирует JSON-схему ответа AI → пишет в `MESSAGES/`
2. Agent 2 (Backend) → API + БД + AI интеграция
3. Agent 1 (Frontend) → UI поверх API (работает параллельно с mock данными)
4. Agent 4 (QA) → тесты по мере готовности компонентов
5. Agent 5 (DevOps) → Docker + CI/CD (параллельно всем)
