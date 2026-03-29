# Home Sale + Purchase Control Centre

A mobile-first SPA that helps manage the full sell-and-buy home journey in one place.

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript, TanStack Router, Tailwind CSS 4, TanStack Query, Zustand
- **Backend**: Node.js + Fastify + TypeScript, Drizzle ORM
- **Database**: Postgres 16 + pgvector
- **Auth**: JWT (access + refresh tokens) with httpOnly cookies
- **File storage**: S3-compatible (MinIO for local dev)
- **AI**: LangGraph.js + OpenAI for summarisation, extraction, retrieval, and recommendations

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- PostgreSQL 16 with `pgvector` extension
- (Optional) MinIO or S3-compatible storage for file uploads

### Setup

```bash
# Install dependencies
pnpm install

# Configure environment
cp packages/api/.env.example packages/api/.env
# Edit packages/api/.env with your database URL and secrets

# Create database
createdb hcc

# Run database migrations
pnpm db:generate
pnpm db:migrate

# Run the embeddings migration (requires pgvector extension)
psql hcc < packages/api/src/db/migrations/0001_init.sql

# Start development servers
pnpm dev
```

The API runs on `http://localhost:3001` and the web app on `http://localhost:5173`.

## Navigation

| Tab | Route | Purpose |
|---|---|---|
| Home | `/` | Dashboard with sale/buy status, tasks, financial snapshot |
| Sell | `/sell` | Sell project: agents, costs, checklists, offers, milestones |
| Buy | `/buy` | Buy project: criteria, properties, comparisons, due diligence, offers |
| Money | `/money` | Financial scenarios, comparisons, affordability modelling |
| Tasks | `/tasks` | Task management, checklists, templates, reminders |
| Library | `/library` | Contacts, communications, notes, research, files |
| Assistant | `/assistant` | AI-powered summaries, Q&A, recommendations |

## Project Structure

```
packages/
  shared/     Zod schemas, TypeScript types, enum constants
  api/        Fastify backend with Drizzle ORM and LangGraph agents
  web/        React SPA with TanStack Router
```
