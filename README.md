# VOCOD

VOCOD is a desktop-first, voice-first AI coding workspace for macOS.

This repository contains the local runtime, Electron shell, and React UI used to power the app.

## Document hierarchy

These files do different jobs and should not compete with each other:

- `docs/PRODUCT_GUIDE.md`: product truth
- `docs/RELEASE_MILESTONES.md`: roadmap truth
- `docs/VOCOD_WEBSITE_BRIEF.md`: website and marketing copy truth
- `README.md`: repository, architecture, and local development guide

If there is a mismatch, update the docs so this hierarchy stays true.

## What VOCOD does

VOCOD lets a developer:

- talk to an AI coding assistant naturally
- continue in text when needed
- work inside an explicitly selected project boundary
- keep writes approval-gated
- review diffs before code changes land
- switch between supported providers such as Codex and Claude Code

The app is desktop-first.
The browser shell in this repo is still useful for development, but it is not the intended public product surface.

## Repository layout

- `apps/web`: React operator console
- `apps/api`: local runtime API, provider execution, voice orchestration, and persistence
- `apps/desktop`: Electron shell for the packaged macOS app
- `docs`: product, roadmap, and website docs
- `local-models`: local speech runtimes and models such as Moonshine, Whisper, and Kokoro (gitignored)

## Architecture

VOCOD has two distinct layers:

### Local runtime

Runs on the user's Mac and owns:

- provider execution
- local file and workspace access
- voice capture and playback
- approvals and diff review
- desktop UI shell

This layer must stay local because it touches the user's machine and code.

### Future cloud/product layer

Will later own:

- website and download flow
- invite-only access and user accounts
- sync-worthy product data
- future analytics and product operations

The coding runtime itself is not meant to be cloud-hosted.

## Current provider model

VOCOD currently supports provider-aware app flows rather than a Codex-only experience.

Supported direction:

- OpenAI Codex
- Anthropic Claude Code

Important product rule:

- provider credentials stay with the provider CLI
- VOCOD only manages app-level connection state and preferences

## Local development

Run these from the repository root.

### Install dependencies

```bash
npm install
```

### Environment

Create a root `.env` from `.env.example`.

Key environment variables include:

```bash
APP_ENV=development
API_PORT=8787
API_HOST=127.0.0.1
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/vocod
DATABASE_SSL=false
CODEX_COMMAND=codex
CLAUDE_COMMAND=claude
VOICE_LOCALE=en-US
STT_PROVIDER=moonshine-local
STT_FALLBACK_PROVIDER=whisper-local
TTS_PROVIDER=kokoro
KOKORO_VOICE=am_michael
KOKORO_SPEED=1
```

The exact optional model/runtime paths depend on your local machine setup.

### Database

Apply migrations:

```bash
npm run db:migrate --workspace @voice-codex/api
```

### Start the app

Start frontend and backend together:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

### Start the desktop flow

```bash
npm run dev:desktop
```

This launches the web renderer and Electron shell, and Electron manages the local API runtime.

## Workspace commands

### Full app

```bash
npm run dev
npm run build
```

### Web

```bash
npm run dev --workspace @voice-codex/web
npm run build --workspace @voice-codex/web
npm run preview --workspace @voice-codex/web
npm run test --workspace @voice-codex/web
```

### API

```bash
npm run dev --workspace @voice-codex/api
npm run build --workspace @voice-codex/api
npm run start --workspace @voice-codex/api
npm run test --workspace @voice-codex/api
npm run db:migrate --workspace @voice-codex/api
```

### Desktop

```bash
npm run dev:desktop
npm run build --workspace @voice-codex/desktop
npm run start --workspace @voice-codex/desktop
```

## Local voice runtime setup

### Kokoro

VOCOD uses Kokoro as the current local TTS direction.

Typical setup:

```bash
cd local-models/kokoro
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
brew install espeak-ng ffmpeg
pip install "kokoro>=0.9.4" soundfile torch
```

Then point your env at the worker command used in this repo.

### Moonshine

VOCOD uses Moonshine as the preferred low-latency local STT direction, with Whisper kept as fallback.

Typical setup:

```bash
cd local-models
mkdir -p moonshine
cd moonshine
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
pip install useful-moonshine-onnx
```

Then point your env at the repo worker command.

## Security posture

The current local runtime includes:

- localhost-only API binding
- per-install local API auth token
- workspace root validation
- secret-path enforcement
- diff/status filtering for protected paths
- tighter desktop IPC boundaries

This is still beta software.
The right way to treat the repo is as a serious desktop product under active hardening, not as a finished public platform.

## Release posture

Current release posture:

`0.1.x beta`

Meaning:

- invite-only beta is the current real target
- public-beta packaging/distribution work is next
- `1.0.0` should mean a serious public VOCOD release, not “first thing that works”

See:

- `docs/PRODUCT_GUIDE.md`
- `docs/RELEASE_MILESTONES.md`
- `docs/VOCOD_WEBSITE_BRIEF.md`
