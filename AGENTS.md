# AGENTS.md

Guide for coding agents and contributors working in this repository.

## Repo Layout

- `backend-api/` - NestJS backend API. Contains REST controllers, Socket.IO broadcast gateway, media/FFmpeg orchestration, Supabase database/storage integration, admin auth, schedule logic, TTS, and Android device-client APIs.
- `backend-api/src/<feature>/` - Backend feature modules. Keep new backend behavior near the relevant module, controller, service, and types.
- `backend-api/docs/` - Admin and Android device-client API documentation.
- `backend-api/DEPLOY.md` - Deployment notes for the backend/full source setup.
- `backend-api/supabase.sql` - Supabase schema/migration SQL to apply through the Supabase SQL Editor.
- `backend-api/.env.example` - Template for local backend configuration.
- `ui-web/` - React 19 + Vite admin web UI.
- `ui-web/src/components/` - Admin screens and shared UI components.
- `ui-web/src/lib/` - Frontend API helpers, shared types, and formatting helpers.
- `ui-web/src/styles/` - Application CSS.
- `docker-compose.yml` - Root production-style stack for web, API, and MediaMTX.
- `backend-api/docker-compose.yml` - Backend/debug stack with API and MediaMTX.

## Run The Project

Install dependencies separately:

```sh
cd backend-api
npm install

cd ../ui-web
npm install
```

Configure the backend:

```sh
cp backend-api/.env.example backend-api/.env
```

Then fill `backend-api/.env` with the required Supabase, admin auth, MediaMTX/HLS, and optional FPT.AI TTS values. Do not commit real secrets.

Apply the database schema by running the contents of `backend-api/supabase.sql` in the Supabase SQL Editor.

Run the backend in development mode:

```sh
cd backend-api
npm run start:dev
```

Run the frontend in development mode:

```sh
cd ui-web
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api`, `/upload`, `/files`, and `/socket.io` to `http://localhost:3000`.

Run the full Docker stack from the repo root:

```sh
docker compose up -d --build
```

Run the backend/debug Docker stack:

```sh
cd backend-api
docker compose up -d --build
```

## Build, Test, And Lint

Backend build:

```sh
cd backend-api
npm run build
```

Backend test currently aliases the build:

```sh
cd backend-api
npm test
```

Frontend build and typecheck:

```sh
cd ui-web
npm run build
```

Frontend preview:

```sh
cd ui-web
npm run preview
```

No lint scripts are currently defined in `backend-api/package.json` or `ui-web/package.json`. Do not invent lint commands in PR notes; either add a real script as part of a deliberate tooling change or state that lint is not available.

## Engineering Conventions And PR Expectations

- Keep backend changes module-scoped under `backend-api/src/<feature>/` when possible.
- Keep frontend changes consistent with the existing component and CSS patterns in `ui-web/src/components/` and `ui-web/src/styles/`.
- Preserve existing API paths, admin cookie/session behavior, Vite proxy assumptions, and Socket.IO routes unless the change explicitly requires updating them.
- Update relevant docs when changing commands, environment variables, Docker behavior, routes, request/response shapes, or deployment steps.
- Keep changes focused. Avoid unrelated README, deploy, formatting, or dependency churn.
- PR descriptions should include a summary, verification commands, config or migration notes, and screenshots for visible UI changes.

## Constraints And Do-Not Rules

- Do not commit real Supabase service role keys, FPT.AI keys, admin passwords, `.env` files, or other secrets.
- Do not change Docker ports, environment defaults, or HLS/RTSP routing without documenting the compatibility impact.
- Do not break Android device-client API contracts without updating `backend-api/docs/android-device-client-api.md`.
- Do not rely on generated files, local uploads, Docker volumes, or untracked runtime artifacts as source of truth.
- Do not rewrite unrelated documentation or refactor unrelated modules while making a scoped fix.
- Do not assume lint, unit test, or workspace scripts exist at the repo root; check package scripts first.

## What Done Means

- Backend work is done when `cd backend-api && npm run build` passes, `npm test` passes, and affected REST endpoints or Socket.IO flows are manually verified when relevant.
- Frontend work is done when `cd ui-web && npm run build` passes and affected screens are checked in a browser.
- Docker or deployment work is done when the relevant `docker compose up -d --build` flow starts successfully and expected ports/routes are reachable.
- Database or API contract work is done when SQL migrations, TypeScript types, API docs, and frontend/backend call sites are updated together.
- Documentation-only work is done when the final document matches the current repo layout and commands.
