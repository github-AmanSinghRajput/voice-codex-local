# Voice Codex Local

Voice Codex Local is a desktop-first voice-native coding operator built around Codex.

It is designed to let a developer:

- talk to Codex naturally
- keep every interaction visible as text
- scope the assistant to a chosen project root
- require approval before file changes
- review diffs clearly
- grow toward notes, memory, and multi-agent workflows

## Core docs

- `README.md`: repository overview and run instructions
- `CLAUDE.md`: architecture overview and developer guidance for AI agents
- `docs/PRODUCT_GUIDE.md`: main long-form product, vision, scope, and release guide
- `docs/RELEASE_MILESTONES.md`: active checkbox roadmap for `v1.0`, `v1.1`, `v1.2`, and `v2.0`
- `docs/SECURITY_NOTES.md`: security model, current gaps, and next hardening steps

## Repository layout

- `apps/web`: React operator console that will be packaged into the macOS app shell
- `apps/api`: local runtime API, voice/session orchestration, and Codex integration
- `apps/desktop`: Electron shell for the packaged macOS app
- `local-models/`: local speech models and runtimes such as `whisper.cpp` and Kokoro (gitignored)

## What this build does

1. Uses your local `codex` CLI login instead of an OpenAI API key.
2. Lets you ask coding questions by voice or text.
3. Lets you select a project root and keep Codex read-only by default.
4. Requires explicit approval before any file-changing run.
5. Shows the latest approved code changes as a diff review panel.
6. Stores text conversation history, not audio recordings.

## Product distribution model

The public product direction is now:

- a product website markets the app and distributes downloads
- users download a macOS `.dmg`
- the real coding agent, local file access, and local TTS runtime live on the user's Mac
- Railway remains the support backend for product data, not the component that edits local code on disk

The browser UI in this repository remains the fastest development shell for now, but it is no longer the intended public product surface.

## Architecture now

The intended shipping architecture is:

- `Electron` desktop shell for macOS
- React UI packaged inside that shell
- local runtime/API on the user's Mac for:
  - Codex CLI access
  - local repo/file access
  - approval execution
  - local TTS/runtime work
- Railway backend + Postgres for product/backend concerns only

## Current product direction

The product is evolving toward:

- a premium macOS voice-first coding workstation
- a website that distributes the desktop app
- inbuilt meeting notes / memory in later releases
- Railway-backed product data and sync
- future specialist sub-agents

The main reference for that direction is `docs/PRODUCT_GUIDE.md`.

The working milestone tracker is `docs/RELEASE_MILESTONES.md`.

## Auth model today

There is no `OPENAI_API_KEY` in this build.

- Assistant access: your local `codex` CLI login session only

If `codex login status` does not show you as logged in, run:

```bash
codex login --device-auth
```

Then complete the browser flow and choose Google sign-in there.

## Local run

1. Create `.env` in the repo root from `.env.example`.
2. Make sure `codex login status` shows you as logged in.
3. Start Postgres locally or point `DATABASE_URL` at an existing instance.
4. Install dependencies:

```bash
npm install
```

5. Apply the initial database schema:

```bash
npm run db:migrate --workspace @voice-codex/api
```

6. Start both apps:

```bash
npm run dev
```

7. Open `http://localhost:5173`.

This browser run is the current development shell. The shipping product target is the packaged macOS app.

## Desktop shell status

The Electron app shell now lives in `apps/desktop`.

Current role:

- open the React UI inside a native macOS window
- become the future home for desktop packaging, DMG distribution, and app-level integrations
- own the local runtime lifecycle during desktop development

Next work after this scaffold:

- connect more desktop-only integrations through preload/IPC
- add DMG packaging, signing, and notarization

## Startup guide for developers and agents

Run these from the repository root unless noted otherwise.

### Full app

Start backend and frontend together:

```bash
npm run dev
```

Build backend and frontend together:

```bash
npm run build
```

### Frontend only

Start the frontend dev server:

```bash
npm run dev --workspace @voice-codex/web
```

Build the frontend:

```bash
npm run build --workspace @voice-codex/web
```

Preview the built frontend:

```bash
npm run preview --workspace @voice-codex/web
```

Run frontend unit tests:

```bash
npm run test --workspace @voice-codex/web
```

### Desktop shell

Start the desktop development flow:

```bash
npm run dev:desktop
```

This starts the web renderer, then Electron launches and manages the local API runtime.

Build the Electron shell:

```bash
npm run build --workspace @voice-codex/desktop
```

Start the Electron shell after building it:

```bash
npm run start --workspace @voice-codex/desktop
```

### Backend only

Start the backend dev server:

```bash
npm run dev --workspace @voice-codex/api
```

Build the backend:

```bash
npm run build --workspace @voice-codex/api
```

Start the built backend:

```bash
npm run start --workspace @voice-codex/api
```

Run backend tests:

```bash
npm run test --workspace @voice-codex/api
```

Apply database migrations:

```bash
npm run db:migrate --workspace @voice-codex/api
```

## Environment

```bash
APP_ENV=development
API_PORT=8787
CORS_ORIGIN=http://localhost:5173
CODEX_COMMAND=codex
CODEX_MODEL=
CODEX_REASONING_EFFORT=
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/voice_codex_local
DATABASE_SSL=false
QUEUE_PROVIDER=inline
EMAIL_PROVIDER=none
VECTOR_PROVIDER=none
RAG_PROVIDER=none
OCR_PROVIDER=none
VOICE_LOCALE=en-US
STT_PROVIDER=none
STT_FALLBACK_PROVIDER=none
WHISPER_MODEL_PATH=
WHISPER_MULTILINGUAL_MODEL_PATH=
WHISPER_SERVER_PORT=8791
TRANSCRIPTION_LANGUAGE_CODE=auto
TTS_PROVIDER=none
KOKORO_COMMAND=
KOKORO_VOICE=af_heart
KOKORO_LANG_CODE=a
KOKORO_SPEED=1
```

## Current API shape

- `GET /api/health/live`
- `GET /api/health/ready`
- `GET /api/system`
- `GET /api/status`
- `GET /api/codex/settings`
- `PUT /api/codex/settings`
- `GET /api/voice/settings`
- `PUT /api/voice/settings`
- `POST /api/voice/commands/resolve`
- `POST /api/voice/commands/apply`
- `POST /api/tts/synthesize`
- `POST /api/workspace/project`
- `POST /api/workspace/write-access`
- `POST /api/codex/logout`
- `GET /api/logs`
- `DELETE /api/logs`
- `POST /api/chat/text`
- `POST /api/approvals/:approvalId/approve`
- `POST /api/approvals/:approvalId/reject`

## Audio engine note

Current `v1.0.0` direction:

- speech-to-text and playback behavior are being optimized for the macOS desktop runtime
- text transcripts remain durable; audio should stay ephemeral
- spoken output uses a pluggable TTS path
- current backend TTS provider is configurable through `TTS_PROVIDER`
- current preferred local provider direction is `Kokoro-82M`
- generated assistant audio is deleted after playback and should never become durable user data

The public product is no longer a browser-first web app. The website is the download surface for the desktop app.

## Local Kokoro setup

If you want local assistant speech output during development, install Kokoro in a dedicated virtualenv and point the backend at the repo wrapper.

```bash
cd /Users/amansingh/Desktop/org/voice-codex-local/local-models/kokoro
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
brew install espeak-ng ffmpeg
pip install "kokoro>=0.9.4" soundfile torch
```

Then set your `.env` values:

```bash
TTS_PROVIDER=kokoro
KOKORO_COMMAND=/Users/amansingh/Desktop/org/voice-codex-local/local-models/kokoro/.venv/bin/python /Users/amansingh/Desktop/org/voice-codex-local/apps/api/scripts/kokoro_tts.py
KOKORO_VOICE=af_heart
KOKORO_LANG_CODE=a
KOKORO_SPEED=1
```

Generated audio is treated as temporary playback data and is deleted after use.

## Backend infrastructure direction

For the current stage, the backend should stay intentionally lean:

- `Postgres` now
- `pgvector` later only if semantic memory becomes necessary
- no Kafka yet
- no heavy queue platform yet
- no RAG system yet
- no OCR service yet

Recommended progression:

1. Postgres as the primary durable store
2. Redis-backed jobs later if background work becomes real
3. `pgvector` inside Postgres if note or memory search needs semantic retrieval
4. a simple email provider later, such as SendGrid or Resend

This is the right shape for an early Railway deployment without overbuilding the backend before the product earns it.
