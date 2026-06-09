# ADR-0002 — PostgreSQL with Drizzle ORM

**Status:** Accepted

## Context

The brief requires a SQL store and two non-trivial analytics queries
(conditional aggregation pivot, CTE with an above-mean filter). It also
explicitly cites **RSPEC-2077** (SQL injection prevention) — every query
must be parametrised.

We needed a database + access layer that gives us:

- `FILTER (WHERE ...)`, `EXTRACT(QUARTER FROM ...)`, and CTEs natively
  (the analytics queries lean on all three).
- Migration tooling so the schema is reproducible from the repo.
- A query builder that **cannot** accidentally build a query by string
  concatenation.
- Type inference from schema to TypeScript without code generation
  steps in CI.

Candidates considered:

- **MySQL** — supports the SQL we need, but window/conditional
  aggregation ergonomics are weaker. No upside over PostgreSQL.
- **Prisma** — popular, but Prisma's raw-SQL escape hatch is awkward
  and template-tag SQL feels bolted on. Migration files are managed
  through a stateful prisma-engine.
- **TypeORM** — historically prone to runtime surprises around
  metadata; less momentum than Drizzle today.
- **Raw `pg` + `sql-template-tag`** — workable, but we would lose the
  schema-as-code that drives types and migrations.
- **PostgreSQL 16 + Drizzle ORM (chosen)** — query builder *and* a
  `sql` template tag that both bind parameters by construction; first-class
  migration files; types inferred directly from the schema definition.

## Decision

- **Database:** PostgreSQL 16 (Alpine image in docker-compose).
- **Access layer:** Drizzle ORM. CRUD goes through the typed query
  builder; the two analytics queries use the `sql` template tag because
  they need `FILTER` and `EXTRACT`. Both code paths parametrise every
  value.
- **Schema:** declared in `src/db/schema.ts`; migrations live in
  `src/db/migrations/` and are applied via `npm run db:migrate`.

## Consequences

- **+** RSPEC-2077 compliance is structural — there is no escape hatch
  that builds SQL by string-concat in this codebase.
- **+** Composite index `(appointment_at, no_show, neighbourhood_id)`
  is declared next to the table it serves, so the SQL-author can see
  what is indexed without leaving the file.
- **+** Drizzle's typed query builder catches schema/code drift at
  compile time.
- **−** `drizzle-kit migrate` silently hangs when the public schema
  already contains the tables (documented in the README troubleshooting
  section). On a fresh DB it works correctly.
- **−** Two SQL idioms in the codebase (query builder for CRUD, `sql`
  tag for analytics). Acceptable because the boundary is by intent
  (CRUD vs. analytics) and each is the right tool for its job.
