# VOCOD Product Guide

## 1. Purpose

This is the main product reference for VOCOD.

It should help:

- engineers understand what the product is now
- AI agents understand what to optimize for
- designers understand the intended product feel
- future collaborators understand what is core versus future scope

If someone reads one document to understand VOCOD, this should be that document.

## 2. What VOCOD Is

VOCOD is a desktop-first, voice-first AI coding workspace.

It lets a developer:

- talk to an AI coding assistant naturally
- see the conversation as live text
- work inside a selected project boundary
- keep writes approval-gated
- review diffs before code changes land
- switch between supported coding providers such as Codex and Claude Code

VOCOD is not meant to be a generic chatbot and not meant to be a browser-only coding toy.

The product direction is:

`a trustworthy voice-native coding workspace for developers`

## 3. Product Vision

The long-term vision is bigger than voice chat for code.

VOCOD should become a voice-native developer workspace that combines:

- coding assistance
- voice interaction
- text chat
- review and approval
- memory and note-taking
- later, ambient vibe/music tooling

The finished product should feel like:

- a serious AI coding cockpit
- a trusted spoken engineering partner
- a premium desktop tool
- something strong enough to demo publicly and useful enough to keep using after the demo

## 4. Core Product Thesis

The product thesis is:

Developers will adopt voice-native AI workflows if the product is:

- actually useful on real projects
- bounded by real project/workspace controls
- explicit about when code is being changed
- fast enough to stay in flow
- auditable after the fact
- visually clear and product-quality

Voice alone is not enough.
Voice only becomes valuable when it is paired with trust, clarity, and real execution discipline.

## 5. Primary Use Cases

### Voice coding

The user talks through a bug, idea, change, or task and gets coding help back naturally.

### Text fallback

The user can continue in text when voice is inconvenient or when they want a more deliberate chat workflow.

### Approval-gated edits

The assistant can propose code changes, but meaningful writes should stay behind review and approval.

### Diff review

The user should be able to inspect AI-generated changes in a review experience that feels closer to reviewing a PR than glancing at a raw patch.

### Future developer memory

VOCOD should evolve into a place where important decisions, notes, tasks, and meeting context become durable and searchable.

## 6. What Makes VOCOD Different

The differentiation is not just "voice."

VOCOD becomes distinctive when it combines:

1. voice-first interaction
2. real local execution against the user's machine and repo
3. project/workspace boundaries
4. approval before mutation
5. visible text transcripts
6. a real review flow
7. provider flexibility
8. future memory/note-taking depth

Most competing experiences only deliver part of that stack.

## 7. Product Principles

### Voice is primary, text is mandatory

Voice drives the experience, but text logs should always exist.

### Trust is part of the product

Project boundaries, read-only defaults, approval gates, and secret handling are product features, not implementation details.

### The app should feel like an operator console

VOCOD should feel intentional, premium, technical, and focused.
It should not feel like a generic SaaS dashboard or a thin wrapper around a chat box.

### Local control matters

The coding runtime should feel like it belongs to the user and runs under their control.

### Demo quality matters

The product should be understandable quickly, visually coherent, and impressive in live use.

### Future scope should not sabotage launch quality

Notes and vibe/music are important, but they should not degrade the core coding loop.

## 8. Current Product Shape

VOCOD today is a desktop-oriented app with a local runtime and a voice/text UI.

### Current working capabilities

- multi-step onboarding
- app-level display name
- app-managed provider connections
- support for Codex and Claude Code
- provider switching between app-connected providers
- voice and text conversation modes
- read-only by default
- approval-gated write flow
- review screen for AI proposed changes
- chat persistence
- settings for voice/theme/provider behavior
- local STT/TTS path
- Moonshine STT with Whisper fallback direction
- Kokoro voice output path
- light and dark theme support

### Current product limitations

- the shipping DMG path still needs hardening
- voice quality still needs final real-device tuning
- local dependency/model setup needs a polished first-run experience
- full end-to-end validation still matters more than adding more surface area
- some repo-level docs and naming still lag behind the current VOCOD brand

## 9. Product Architecture Direction

VOCOD naturally splits into two product layers.

### Local runtime

Runs on the user's machine and owns:

- local UI shell
- local assistant/provider execution
- local repo/file access
- voice capture and playback
- local review/approval loop

This layer must remain local because it touches local code and local tooling.

### Future cloud layer

Should later own:

- invite-only access and user accounts
- website and download flow
- sync-worthy product data
- future analytics and product operations
- later multi-device or team features

The coding runtime itself should not become cloud-hosted.

## 10. Assistant Provider Direction

VOCOD is no longer a Codex-only product.

The current product direction is provider-aware:

- OpenAI Codex
- Anthropic Claude Code

Important rule:

VOCOD should manage app-level connections and preferences, but it should not own or copy provider credentials.

## 11. Voice Product Direction

The voice experience should feel:

- natural
- fast
- interruptible
- visible
- trustworthy

That means VOCOD should keep improving:

- STT accuracy
- TTS naturalness
- noisy-room robustness
- speaking/listening transitions
- visible live text while the assistant responds

The benchmark is not "it technically works."
The benchmark is "it feels native enough that a developer wants to keep using it."

## 12. Distribution Direction

The intended public distribution model is:

- website explains the product
- users download the macOS app
- the app runs a local runtime for coding work
- future cloud services support product/distribution concerns, not local code execution

The browser dev shell is useful for development, but it is not the intended public product.

## 13. Beta and Launch Stance

Current release posture should be treated as:

`invite-only beta`

That means the real priorities are:

- reliability
- trust
- visual coherence
- voice quality
- end-to-end testing

Not every future idea needs to ship before the beta is valuable.

## 14. Near-Term Roadmap

### Beta / launch-critical

- harden DMG/distribution path
- finish real-device voice tuning
- tighten onboarding and first-run setup
- keep review and provider flows reliable
- make the app feel polished in both dark and light themes

### Next major product track

Build developer memory and notes in a serious way, not as a throwaway sidebar.

## 15. Future Major Features

### Granola-level note-taker

This is one of the biggest future expansions for VOCOD.

The ambition is not just "save notes."
It is a serious developer-focused meeting and thinking companion with:

- strong transcripts
- summaries
- decisions
- action items
- memory and recall
- conversation over past sessions

### Vibe music

This is another major future track.

The goal is not gimmicky background noise.
It is a high-quality focus and ambience layer that makes VOCOD feel more immersive during long coding sessions.

This should come after the core product is trusted.

## 16. What Should Stay Out of Scope for Now

Until beta and launch quality are strong, VOCOD should resist:

- random feature sprawl
- cloud-hosted code execution
- weakly designed novelty add-ons
- adding more providers without making current ones reliable
- shipping future-facing surfaces that dilute the core coding workflow

## 17. Summary

VOCOD is becoming:

`a trustworthy voice-first coding workspace with real local execution, approval-gated changes, provider flexibility, and a long-term path into developer memory and immersive tooling.`

That should be the lens for product, design, and engineering decisions.
