# Repository Guidelines

## Project Structure & Module Organization
This repository is an npm workspace with three apps under `apps/`. `apps/api/src` contains the local Express runtime, database helpers, and feature modules such as `features/voice` and `features/workspaces`. `apps/web/src` contains the React/Vite operator console, with UI under `containers/voice-console` and clients under `services/api`. `apps/desktop/src` holds the Electron shell. Supporting material lives in `docs/`, native integrations in `native/`, and bundled speech runtimes in `local-models/`.

## Build, Test, and Development Commands
Run commands from the repository root unless noted otherwise.

- `npm run dev`: starts the API and web app together.
- `npm run dev:desktop`: builds the desktop shell, starts Vite, then launches Electron.
- `npm run build`: type-checks and builds all workspaces.
- `npm run start`: runs the built API and previews the built web app.
- `npm run test --workspace @voice-codex/api`: runs backend `node:test` suites.
- `npm run test --workspace @voice-codex/web`: runs frontend `node:test` suites.
- `npm run db:migrate --workspace @voice-codex/api`: applies local database migrations.

## Coding Style & Naming Conventions
TypeScript is configured in strict mode via `tsconfig.base.json`; keep new code type-safe and ESM-compatible. Follow the existing 2-space indentation and concise import style. Use `PascalCase` for React components (`VoiceConsoleContainer.tsx`), `camelCase` for functions and variables, and lowercase descriptive filenames for backend modules (`voice-session.service.ts`, `http.test.ts`). Keep API code feature-scoped under `apps/api/src/features/*`. No repository-wide ESLint or Prettier config is committed, so match surrounding file style and rely on `npm run build` to catch issues.

## Testing Guidelines
Tests are colocated with source files and use the `*.test.ts` pattern. Prefer `node:test` with `assert/strict`, following existing tests in `apps/api/src` and `apps/web/src/containers/voice-console/lib`. Add tests for new service behavior, pure helper functions, and regressions before changing approval, voice, or workspace flows. No coverage gate is enforced, but new logic should include targeted tests.

## Commit & Pull Request Guidelines
Recent history is sparse (`Initial commit`, `Merge remote bootstrap`), so use short imperative commit subjects that describe the change clearly, for example `Add desktop API health check`. Keep commits focused and avoid mixing refactors with behavior changes. PRs should include a concise summary, affected apps (`api`, `web`, `desktop`), commands run for verification, and screenshots or recordings for UI changes. Link related issues or product docs when relevant.

## Security & Configuration Tips
Review `.env.example` and `README.md` before running locally. Keep secrets and machine-specific paths out of committed files, and do not hardcode local model or database credentials in source.
