# Voice Codex Local Release Milestones

This file is the working release roadmap for the product.

It is intentionally checkbox-driven so the team can track what is:

- shipped
- in progress
- intentionally deferred

This should stay aligned with the actual product plan, not with wishlist scope.

## Product release model

The release sequence is:

1. `v1.0`: Voice Codex macOS desktop launch
2. `v1.1`: multi-coding-assistant login
3. `v1.2`: production-grade AI note-taker for developer meetings
4. `v2.0`: developer vibe / music recommendation layer

---

## v1.0: Voice Codex Launch

Goal:
Ship a public-facing macOS voice-first coding product that feels trustworthy, sharp, and usable daily.

Primary launch surfaces:

- product website for download and product messaging
- macOS desktop app distributed as `.dmg`

Non-primary surfaces:

- local browser-based development shell only

### Core product

- [ ] polished onboarding / connect flow
- [ ] local Codex login flow clearly guided in UI
- [ ] continuous voice conversation loop
- [ ] clear text fallback input
- [ ] stable conversation transcript/log view
- [ ] project boundary selection
- [ ] read-only by default
- [ ] approval-gated file changes
- [ ] revoke write access control
- [ ] logout Codex control

### Voice

- [ ] robust live voice session UX
- [ ] clear listening / thinking / speaking states
- [ ] browser Web Speech API transcription loop
- [ ] active-input device label in UI
- [ ] device hot-plug / unplug detection
- [ ] auto-restart speech recognition on device switch
- [ ] no-microphone detected fallback state
- [ ] backend TTS provider abstraction
- [ ] Kokoro-82M integration
- [ ] audio playback of generated assistant speech in the desktop runtime
- [ ] Piper or browser `speechSynthesis` fallback
- [ ] device-aware audio status
- [ ] manual device selection if platform/device constraints require it later

### Trust and review

- [ ] clear approval request presentation
- [ ] premium diff review surface
- [ ] changed-file switching in diff review
- [ ] approval history view
- [ ] clear workspace trust messaging

### Frontend quality

- [ ] production-grade desktop shell
- [ ] premium top bar / spacing / hierarchy polish
- [ ] terminal-style conversation surface refinement
- [ ] settings surface polish
- [ ] responsive mobile layout polish
- [ ] skeleton loading states
- [x] toast notifications
- [x] lazy loading for heavy screens
- [ ] reduced-motion support fully verified

### Backend quality

- [x] Postgres setup
- [x] DB-backed chat persistence
- [x] DB-backed approval history
- [x] DB-backed notes foundation
- [x] env validation
- [x] centralized error handling
- [x] request IDs
- [x] rate limiting baseline
- [x] structured logging baseline
- [ ] stronger voice/device settings persistence
- [ ] more backend tests around voice/settings flows
- [ ] packaging/deployment hardening for launch

### Launch readiness

- [ ] launch copy and messaging
- [ ] website/landing page
- [ ] download/install documentation for public users
- [ ] Electron app-shell setup
- [ ] macOS packaging plan
- [ ] `.dmg` build path
- [ ] macOS signing and notarization plan
- [ ] basic analytics/error-reporting plan
- [ ] Railway deployment plan

### Explicitly out of scope for v1.0

- [ ] Google product auth
- [ ] Claude Code login
- [ ] meeting note-taker workflows
- [ ] meeting participation agent
- [ ] music recommendation system

These are deferred on purpose and should not block launch.

---

## v1.1: Multi-Coding-Assistant Login

Goal:
Expand the operator shell beyond Codex so users can connect different coding assistants in one product.

### Scope

- [ ] Codex login remains supported
- [ ] Claude Code login support
- [ ] assistant provider abstraction in backend
- [ ] assistant/provider selector in UI
- [ ] provider-specific capability handling
- [ ] provider session management
- [ ] provider-specific trust/review handling if needed
- [ ] UX copy updated from "Codex only" to "coding assistant"

### Non-goals

- [ ] full multi-agent orchestration platform
- [ ] enterprise account/team management

---

## v1.2: AI Note-Taker for Developer Meetings

Goal:
Ship a production-grade AI note-taker designed specifically for developer meetings.

This is a major feature track, not a small extension of the v1.0 memory panel.

### Notes foundation already present

- [x] basic note storage
- [x] note create/edit/delete
- [x] memory screen foundation

### Required meeting-note-taker scope

- [ ] real meeting recording flow
- [ ] transcript capture pipeline
- [ ] AI-generated meeting summaries
- [ ] action item extraction
- [ ] decisions extraction
- [ ] code/task context extraction
- [ ] searchable note history
- [ ] note detail / session detail view
- [ ] better note organization and filtering
- [ ] speaker-aware meeting UX if supported
- [ ] import/export/share workflow

### Advanced vision for this release

- [ ] ask questions about past notes via voice
- [ ] interact with meeting memory conversationally
- [ ] meeting companion mode for developers
- [ ] exploratory "join meeting and answer when asked" scope definition

This last point is intentionally not committed as shipped scope yet. It needs separate product definition before implementation.

---

## v2.0: Developer Vibe Layer

Goal:
Make the product more immersive and enjoyable during long coding sessions.

### Scope

- [ ] music recommendation system
- [ ] coding-mode personalization
- [ ] session-aware ambiance recommendations
- [ ] taste/profile settings
- [ ] optional integrations depending on licensing/product direction

### Important constraint

This should only be built after the core product is already trusted and useful.

It is a product amplifier, not the product foundation.

---

## Ongoing rules

- [ ] keep `v1.0` launch quality as the priority until public release
- [ ] do not let future note-taker scope derail the voice coding launch
- [ ] do not let novelty features block trust, review, and usability work
- [ ] keep the public product desktop-first
- [ ] update this file whenever scope changes materially
- [ ] use this file as the milestone source of truth during implementation
