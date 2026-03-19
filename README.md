# Voice Codex Local

Fresh local monorepo for a voice-first coding assistant:

- `apps/web`: React app for Codex sign-in status, voice chat, text chat, and transcript logs
- `apps/api`: Express API for Codex CLI chat, workspace controls, approvals, and transcript logs
- `data/`: local JSON persistence for the conversation history
- `docs/IMPLEMENTATION_CHECKLIST.md`: completion checklist
- `docs/ROADMAP.md`: planned features and phases
- `docs/SECURITY_NOTES.md`: current safeguards and known gaps

## What this build does

1. Uses your local `codex` CLI login instead of an OpenAI API key.
2. Lets you ask coding questions by voice or text.
3. Lets you select a project root and keep Codex read-only by default.
4. Requires explicit approval before any file-changing run.
5. Shows the latest approved code changes as a diff review panel.
6. Uses a local macOS audio bridge for spoken input, system speech output for replies, and stores the text log.

## Auth model

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
3. Install dependencies:

```bash
npm install
```

4. Start both apps:

```bash
npm run dev
```

5. Open `http://localhost:5173`.

## Environment

```bash
API_PORT=8787
CORS_ORIGIN=http://localhost:5173
CODEX_COMMAND=codex
CODEX_MODEL=
VOICE_LOCALE=en-US
SYSTEM_VOICE=
SYSTEM_VOICE_RATE=190
```

## API shape

- `GET /api/status`
- `GET /api/voice/events`
- `POST /api/voice/session/start`
- `POST /api/voice/session/stop`
- `POST /api/workspace/project`
- `POST /api/workspace/write-access`
- `POST /api/codex/logout`
- `GET /api/logs`
- `DELETE /api/logs`
- `POST /api/chat/text`
- `POST /api/approvals/:approvalId/approve`
- `POST /api/approvals/:approvalId/reject`

## Audio engine note

Voice capture and playback now run through the local machine, not browser speech APIs:

- input uses the current macOS default input device
- replies speak through the current macOS default output device
- the web UI receives live transcript and voice-state updates from the backend over server-sent events

On first use, macOS may ask the terminal or Node process for microphone and speech-recognition access.
