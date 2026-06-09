# ADR-0001 — Next.js 15 App Router as the API platform

**Status:** Accepted

## Context

The brief requires a REST API that ingests a healthcare CSV and serves two
analytics queries, with optional dashboards and a containerised
deployment story. We needed a runtime that:

- Exposes an idiomatic REST surface with a small amount of glue code.
- Lets a future dashboard share the same deployable (the brief lists a
  data-quality dashboard as bonus, and a single deployable keeps the
  ops story trivial).
- Has first-class TypeScript support and a fast iteration loop.
- Is well-known to the reviewing team — the goal is to demonstrate
  engineering judgement, not to introduce an unfamiliar runtime.

Candidates considered:

- **Express / Fastify** — minimal, but every quality-of-life feature
  (typed routing, streaming `formData`, dev-time HMR, file-based
  routing) becomes manual plumbing.
- **NestJS** — strong DI and modularity, but heavier than this scope
  warrants. The brief explicitly notes "smaller, well-finished" beats
  "sprawling, incomplete".
- **Next.js 15 App Router (chosen)** — Route Handlers are a thin REST
  surface, the runtime ships `request.formData()` and streaming `Request`
  bodies, and the same deployable can host a server-rendered dashboard.

## Decision

Use Next.js 15 with the **App Router**. Every endpoint lives in
`app/api/**/route.ts` and is intentionally thin: parse the request
boundary, validate with Zod, delegate to a service in `src/services/`.

The dashboard at `/` is a server component that calls the analytics
services **directly** (no self-HTTP), proving the boundaries are clean
without paying a serialisation hop.

## Consequences

- **+** One container in `docker-compose.yml`, one Dockerfile, one
  process to run for API + UI. Operational story is tiny.
- **+** Route Handlers + TypeScript + Zod give type-safety from the
  HTTP boundary to the database call.
- **+** `next build` is in CI, so the production build is exercised on
  every push (catches issues the dev server hides).
- **−** Brings React + a UI toolchain into a service that is 90 % API.
  Acceptable because the dashboard pays the cost back; if we removed
  the dashboard tomorrow we would re-evaluate.
- **−** Some readers expect "Next.js" to mean "frontend only"; the
  README makes the dual-role explicit and the architecture diagram
  shows where the API code sits.
