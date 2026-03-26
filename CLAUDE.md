# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Voice Codex Local — a local-first, voice-native coding assistant wrapping Anthropic's Codex CLI. Users talk to Codex via voice or text, see interactions as visible logs, select an explicit project root, and approve file changes before execution.

## Commands

```bash
# Full stack (API on :8787, Web on :5173)
npm run dev

# Individual apps
npm run dev --workspace @voice-codex/api
npm run dev --workspace @voice-codex/web

# Build
npm run build

# Tests (Node.js native test runner)
npm run test --workspace @voice-codex/api
npm run test --workspace @voice-codex/web

# Database
npm run db:migrate --workspace @voice-codex/api
npm run db:ready --workspace @voice-codex/api
```

## Environment

Copy `.env.example` to `.env`. Required: `DATABASE_URL` (Postgres). API runs on port 8787, web on 5173. Config validated strictly in `apps/api/src/config/env.ts`.

## Architecture

**Monorepo** with npm workspaces (`@voice-codex/api`, `@voice-codex/web`, `@voice-codex/desktop`) and local speech runtimes.

### Backend (`apps/api`)

- **Entry**: `src/index.ts` → validates env, calls `src/app/createApp.ts` (Express app factory, all routes + middleware)
- **Feature modules** in `src/features/` — each has service + repository layers: `auth`, `users`, `workspaces`, `chat`, `voice`, `notes`, `system`, `approvals`
- **Codex integration**: `src/codex-client.ts` — wraps CLI commands (`codex exec`) with sandbox modes (`read-only` / `workspace-write`), manages conversation context (last 12 messages), enforces secret policy
- **Lazy voice runtime**: local Whisper and Kokoro workers are warmed on voice session start and cooled down after 5 minutes of idle — not kept resident at all times
- **Runtime state**: `src/runtime.ts` — in-memory singleton (`runtimeState`) holding workspace, pendingApproval, lastDiff, audio, voiceSession state
- **Shared libs**: `src/lib/` — logger (structured JSON), AppError class, Express helpers (asyncHandler, validators), EventBus (SSE), rate limiter
- **Database**: `src/db/client.ts` (pg pool), migrations in `database/postgres/` (4 files). Schema: app_users, workspaces, conversation_sessions/messages, notes/note_chunks, approval_events, app_sessions, app_preferences

### Frontend (`apps/web`)

- **Single-container pattern**: `src/containers/voice-console/VoiceConsoleContainer.tsx` orchestrates all screens (Voice, Terminal, Review, Workspace, Onboarding, Memory, Settings)
- **Screen components** in `src/containers/voice-console/components/`
- **API service layer**: `src/services/api/` — `BaseApiService` (fetch wrapper) extended by `OperatorConsoleApiService` (typed methods for all endpoints)
- **Shared types/helpers**: `src/containers/voice-console/lib/` (types.ts, constants.ts, helpers.ts, diff.ts)
- **Styling**: Custom CSS with design tokens in `src/styles.css` — Space Grotesk (body) + JetBrains Mono (code), no Tailwind. Custom properties for colors, surfaces, spacing
- **State**: Component-local useState, localStorage for preferences, renderer-driven mic capture with desktop event/status updates
- **Build**: Vite + React 19, strict TypeScript

## Key Patterns

- **Approval flow**: Chat service detects write intent via Codex → creates pendingApproval → frontend shows diff review → user approves/rejects → approved writes execute with `--sandbox workspace-write`
- **SSE for real-time**: EventBus in `src/lib/event-bus.ts` pushes voice state and chat updates to frontend via `/api/voice/events`
- **Secret policy**: Hardcoded patterns in `runtime.ts` block access to .env, *.pem, *.key, .aws/, .npmrc, .docker/ etc.
- **Strict TypeScript**: `tsconfig.base.json` with `strict: true`, ES2022 target, ESNext modules, Bundler resolution. API emits JS to `dist/`; web uses Vite (no emit)

## Known Issues

- The product direction has pivoted to a desktop-first Electron app distributed via DMG. Browser-based development remains the fastest shell, but it is no longer the public runtime target.
- Desktop STT now uses renderer mic capture plus local `whisper.cpp`, with AssemblyAI only as an explicit fallback.
- The `native/` directory (Apple Speech bridge) has been removed — STT is now fully handled by whisper.cpp and AssemblyAI fallback.
