# VOCOD Release Milestones

This file is the active release roadmap for VOCOD.

It exists to answer one question clearly:

`What is shipped, what is next, and what is intentionally later?`

If a milestone or feature is not useful for deciding product direction or execution priority, it should not live here.

## Versioning stance

Current release posture:

- `0.1.0-beta.x` = invite-only beta
- `0.2.x` = launch hardening and public-beta readiness
- `1.0.0` = first serious public VOCOD release

## Product phases

The current product sequence is:

1. `0.1 beta`: reliable invite-only desktop beta
2. `0.2`: public-beta readiness and packaging/distribution hardening
3. `1.0`: trustworthy voice-first coding desktop launch
4. `1.1`: note-taker foundation and meeting memory
5. `1.2`: Granola-level developer meeting note-taker
6. `2.0`: vibe music and immersive coding ambience

---

## 0.1 Beta: Invite-Only Desktop Beta

Goal:
Ship a testable macOS desktop beta that feels coherent, safe enough to demo, and strong enough to put in front of real users on an invite basis.

### Product identity

- [x] product renamed to `VOCOD`
- [x] desktop-first product direction
- [x] dynamic provider-aware UI instead of Codex-only language
- [ ] README and repo-level naming fully cleaned up everywhere

### Core assistant flow

- [x] project/workspace selection
- [x] read-only by default
- [x] approval-gated write flow
- [x] review screen for proposed code changes
- [x] text chat fallback
- [x] voice conversation loop
- [x] multi-provider support for Codex and Claude Code
- [x] app-managed provider connection state
- [x] provider switching between connected providers
- [ ] end-to-end provider reliability fully validated on real machines

### Voice quality

- [x] local TTS path
- [x] local STT path
- [x] Moonshine STT integration
- [x] Whisper fallback path
- [x] Kokoro voice selection
- [x] speaking/listening UI states
- [x] streamed text visibility while the assistant responds
- [ ] final tuning for natural TTS pacing and chunk flow
- [ ] final tuning for barge-in sensitivity and noisy-room robustness
- [ ] real-device validation across multiple microphones and rooms

### UI and UX

- [x] step-based onboarding
- [x] app-level display name
- [x] light and dark mode
- [x] provider-aware onboarding
- [x] PR-style review flow
- [x] voice screen redesign
- [x] chat screen with message-only scrolling
- [ ] final full-app visual QA in light theme
- [ ] final pass on spacing, copy, and consistency across every screen

### Security baseline

- [x] local API bound to localhost
- [x] per-install local API auth token
- [x] workspace root validation tightened
- [x] secret-path enforcement in code
- [x] sensitive diff/status filtering
- [x] stricter desktop IPC/runtime boundary
- [x] CSP baseline
- [ ] dedicated security review after beta stabilization

### Distribution baseline

- [ ] DMG packaging path
- [ ] first-launch dependency/model setup experience
- [ ] install/update instructions
- [ ] invite-only beta website/download flow
- [ ] beta release checklist

---

## 0.2: Public-Beta Readiness

Goal:
Turn the private beta into something that can be downloaded and tested by broader external users without hand-holding.

### Required scope

- [ ] stable DMG generation
- [ ] signing/notarization plan
- [ ] simple install flow for local runtimes/models
- [ ] first-run health checks inside the app
- [ ] better failure recovery when local models/providers are missing
- [ ] provider/account/session messaging polished for real users
- [ ] version display and update strategy
- [ ] public-facing website for product messaging and download

### Non-goals

- [ ] enterprise admin
- [ ] team collaboration
- [ ] cloud-hosted code execution

---

## 1.0: VOCOD Public Launch

Goal:
Launch VOCOD as a trustworthy voice-first coding desktop app for real developer workflows.

### Launch bar

- [ ] voice experience feels fast, clear, and dependable
- [ ] text chat feels polished and production-grade
- [ ] review flow is trustworthy enough for daily use
- [ ] onboarding is fast and understandable for first-time users
- [ ] Claude and Codex both feel first-class
- [ ] desktop app install experience is clean
- [ ] public website explains the product and sets expectations
- [ ] core security posture is credible for external users

### Product bar

- [ ] users can reliably talk, review, and approve work in one loop
- [ ] users can choose their provider and model confidently
- [ ] voice mode feels native rather than gimmicky
- [ ] the product is demo-worthy and founder-pitch-worthy

---

## 1.1: Note-Taker Foundation

Goal:
Expand VOCOD from voice coding into durable developer memory and session capture.

### Scope

- [ ] strong notes data model
- [ ] searchable note history
- [ ] note timeline/session timeline
- [ ] transcript-linked notes
- [ ] note summaries and extracted actions
- [ ] settings and UX for note capture preferences

### Why this matters

This starts moving VOCOD from "voice coding app" toward "voice-native developer workspace."

---

## 1.2: Granola-Level Developer Note-Taker

Goal:
Ship a note-taking experience that feels competitive with best-in-class meeting-note products, but built for developers.

### Product ambition

- [ ] meeting capture flow
- [ ] high-quality transcripts
- [ ] decisions extraction
- [ ] action items extraction
- [ ] engineering-context summaries
- [ ] code/task references tied to discussion
- [ ] searchable memory across sessions
- [ ] beautiful detail views for sessions and notes
- [ ] conversational recall of past meetings and decisions

### Important constraint

This is a major product line, not a sidebar feature.
It should be treated with the same seriousness as the core voice-coding experience.

---

## 2.0: Vibe Music

Goal:
Add an immersive, high-quality vibe/music layer that amplifies focus and makes VOCOD feel more like an intelligent coding environment.

### Scope direction

- [ ] music and ambience system
- [ ] coding-session-aware recommendations
- [ ] focus modes / mood modes
- [ ] personalized taste/profile controls
- [ ] optional adaptive music based on session state

### Constraint

This should only be pushed hard after the core coding and note-taking product is already trusted.

---

## Ongoing rules

- [ ] keep the beta and launch experience grounded in trust and reliability
- [ ] do not let future note-taker scope derail core voice-coding quality
- [ ] do not let vibe/music novelty outrun product fundamentals
- [ ] keep VOCOD desktop-first
- [ ] keep local execution and explicit user control as product pillars
- [ ] update this file when scope changes materially
