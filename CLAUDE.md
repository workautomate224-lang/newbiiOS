# CLAUDE.md — FutureOS Project Context

## Project Overview
FutureOS is a Future Computation Engine. Three products: Lite + Studio + Exchange.
Detailed architecture: docs/FutureOS_Development_Blueprint.md

## Development Rules
1. Read before each session: docs/FutureOS_Development_Blueprint.md + relevant contracts/ + docs/sessions/current.md
2. Use TypeScript (frontend) + Python (backend)
3. Every feature must have tests (coverage >80%)
4. Before commit: pnpm lint && pnpm test && cd api && poetry run pytest
5. Follow module contracts (contracts/) interfaces, no cross-module internal dependencies
6. Update docs/sessions/current.md after each session

## Project Structure
```
futureos/
├── CLAUDE.md                 # This file (Claude Code reads this)
├── docs/
│   ├── FutureOS_Development_Blueprint.md  # Complete blueprint
│   ├── contracts/            # Module interface contracts
│   ├── specs/                # Module implementation specs
│   ├── sessions/             # Session state
│   └── decisions/            # Decision log
├── web/                      # Next.js 15 frontend
│   ├── src/app/              # App Router pages
│   ├── src/components/       # Shared components
│   ├── src/lib/              # Utility functions
│   ├── src/stores/           # Zustand stores
│   └── src/test/             # Test setup
├── api/                      # FastAPI backend
│   ├── app/
│   │   ├── core/             # Config/database/auth
│   │   ├── models/           # Pydantic data models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── routers/          # API routes
│   │   ├── services/         # Business logic
│   │   └── agents/           # LangGraph Agents
│   └── tests/                # Backend tests
├── supabase/                 # Supabase migrations + config
│   ├── migrations/
│   └── config.toml
├── shared/                   # Shared type definitions
│   └── types/                # TypeScript + Python shared interfaces
├── docker-compose.yml        # Local dev (Redis + Neo4j)
└── .github/workflows/        # CI/CD
```

## Tech Commands
- Start local: `supabase start && docker-compose up -d && pnpm dev` + `cd api && poetry run uvicorn app.main:app --reload`
- Frontend test: `cd web && pnpm test`
- Backend test: `cd api && poetry run pytest -v --cov=app --cov-report=term-missing`
- Type check: `cd web && pnpm typecheck`
- Lint: `pnpm lint && cd api && poetry run ruff check .`
- DB migration: `supabase db push`

## Architecture Decisions
- Frontend: Next.js 15 (App Router) + TypeScript + Tailwind CSS 4 + shadcn/ui
- Backend: FastAPI (Python) + Poetry
- BaaS: Supabase (PostgreSQL + Auth + Realtime + Storage + pgvector)
- Graph DB: Neo4j Aura (causal knowledge graph)
- Cache/Queue: Redis
- AI: OpenRouter API (model routing layer)
- AI Orchestration: LangGraph
- Visualization: PixiJS v8 (2D Agent) + D3.js (causal graph)
- Deployment: Railway (web + api + worker + Redis)
