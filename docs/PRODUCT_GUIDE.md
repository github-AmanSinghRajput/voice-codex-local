# Voice Codex Local Product Guide

## 1. Purpose of This Document

This document is the main product reference for Voice Codex Local.

It is written to help:

- AI agents understand the product clearly
- human collaborators onboard quickly
- designers understand the product scope
- engineers understand current architecture and future direction
- product-minded reviewers give better feedback
- future team members understand what this should become

If someone needs one document to understand the product, this should be the first file they read.

## 2. Product Overview

Voice Codex Local is a desktop-first voice-first AI coding assistant built around Codex.

It is designed to let a developer talk to an AI coding operator naturally, keep a visible text log of the conversation, constrain the assistant to an explicitly selected project root, and require approval before any file changes are applied.

The product is not meant to be a generic chatbot or a browser-only coding website.

It is a high-trust coding operator.

The central experience is:

- talk to Codex naturally
- see every spoken interaction reflected as text
- work inside a chosen project boundary
- keep file changes approval-gated
- review diffs clearly
- eventually manage notes, memory, tasks, and specialist sub-agents in the same system

The product website is meant to distribute the macOS app, not replace it.

## 3. Product Vision

The long-term vision is to create a macOS voice-native software engineering workstation.

Instead of forcing a developer to jump between:

- a terminal
- an IDE
- a browser
- an AI chat
- notes
- task lists

the product should bring those workflows together into one operator surface.

The finished product should feel like:

- an AI coding cockpit
- a trusted spoken engineering partner
- a serious local-first developer tool
- a system worthy of daily use
- a product impressive enough to demo publicly

This should become more than "voice chat for code."

The stronger ambition is:

`a trusted voice-native AI coding operator`

## 4. The Problem We Are Solving

Current AI coding workflows have several problems:

1. Most AI coding tools are still primarily text-box based.
2. Voice experiences are usually shallow, gimmicky, or unreliable.
3. Developers do not trust uncontrolled autonomous edits.
4. AI output is often disconnected from the actual repo and actual execution flow.
5. Existing tools often feel like demos instead of serious software products.

There is a gap between:

- "AI can answer coding questions"

and

- "AI can safely operate as a real engineering companion inside my workflow"

Voice Codex Local is meant to close that gap.

## 5. Product Thesis

The core product thesis is:

Developers will adopt voice-native AI coding workflows if the system is:

- useful on real projects
- bounded and trustworthy
- visually clear
- fast enough to stay in flow
- interruptible
- auditable
- better than a novelty layer on top of chat

Voice becomes compelling only when it is paired with trust and execution discipline.

That trust layer is part of the product, not just an engineering concern.

## 6. Core Product Positioning

The best current positioning is:

`Voice Codex Local is a trusted macOS voice-native coding operator for developers who want to talk to an AI engineering partner without giving up control of their codebase.`

This is stronger than:

- "voice AI for coding"
- "talk to Codex"
- "AI coding assistant with voice"

because it emphasizes both:

- natural interaction
- controlled execution

## 7. What Makes This Product Different

The differentiator is not just voice.

The product becomes distinctive when it combines:

1. voice-native interaction
2. local-machine execution flow
3. explicit project scope
4. approval before mutation
5. visible text logs
6. diff-based review
7. future notes, memory, and multi-agent delegation

That combination is meaningful.

Most tools have only part of this:

- chat but no execution control
- voice but no real coding workflow
- agents but weak trust boundaries
- coding help but no product-quality operator surface

Voice Codex Local can become a category-level product if it holds this combination tightly.

## 8. Ideal Users

### Primary users

- solo developers
- startup founders who code
- indie hackers
- AI-native builders
- senior engineers who want faster iteration

### Secondary users

- engineering managers who still build
- technical creators and demo-driven builders
- developer advocates
- teams exploring AI-assisted workflows

### Strong early adopter profile

The strongest early user is likely:

`a technically capable builder who wants a serious AI coding workflow, wants voice to be useful, and does not want to surrender control of the codebase`

## 9. Main User Jobs

The product should help users do these jobs well.

### Job 1: Think out loud while building

The user wants to speak ideas, bugs, architecture thoughts, and implementation directions without constantly typing.

### Job 2: Ask for coding help in project context

The user wants the assistant to respond with awareness of the selected workspace, not generic advice only.

### Job 3: Delegate execution safely

The user wants Codex to propose real code changes, but only apply them when explicitly approved.

### Job 4: Review changes clearly

The user wants file changes to be legible, beautiful, and trustworthy.

### Job 5: Keep a record

The user wants every spoken exchange reflected into text logs.

### Job 6: Build memory over time

The user wants important decisions, action items, and notes captured in a reusable way.

## 10. Product Principles

These principles should guide design and engineering decisions.

### Principle 1: Voice is primary, text is mandatory

Voice drives interaction, but text logs must always exist.

### Principle 2: Local control matters

The product should feel like it belongs to the user and runs with the user's explicit control.

### Principle 3: Approval before mutation

Any meaningful file modification must be gated by explicit approval.

### Principle 4: The UI should feel like an operator console

The interface should feel intentional, technical, premium, and distinct from generic SaaS dashboards or chatbot clones.

### Principle 5: Product boundaries should be real

Project scoping, secrets handling, and write controls are part of the product promise.

### Principle 6: Demo quality matters

This product should be understandable quickly, impressive visually, and credible technically.

## 11. Current Product Scope

The current build already supports a real working loop.

### Current capabilities

- local frontend and backend monorepo
- local Codex CLI login instead of API keys
- manual project root selection
- read-only mode by default
- revocable write mode
- approval gate before file-changing work
- persistent text logs
- diff capture and review after approved changes
- continuous voice session support
- browser-shell voice input during development
- pluggable local TTS direction for desktop packaging
- text fallback for non-voice interaction

### Current limitations

- the public desktop packaging path is not finished yet
- transcription and playback still need final desktop-grade validation
- output speech needs final Kokoro packaging/runtime polish
- secrets protection is still policy-driven rather than fully hardened
- note-taking exists only as product direction, not yet as a finished feature
- multi-agent orchestration is planned, not implemented
- frontend visual quality is improving but not yet final public-launch quality

## 12. Distribution Model

The product distribution model is now:

1. a marketing/product website explains the product
2. users download the macOS app from that website
3. the real coding runtime, local file access, and local TTS model run on the user's Mac
4. Railway hosts product/backend concerns such as accounts, metadata, and future sync

This distinction matters because a plain hosted web app cannot safely or fully deliver the local coding-agent promise on its own.

## 13. Current User Flow

The current user flow is:

1. User opens the app
2. App checks local Codex login status
3. User manually sets a project root
4. User keeps the assistant in read-only mode or enables write-proposal mode
5. User starts a voice session or types a prompt
6. Speech is transcribed and sent to Codex
7. Codex returns either a direct reply or a write proposal
8. Replies are logged and optionally spoken back through the desktop voice stack
9. Write proposals are paused for approval
10. Approved changes are executed and surfaced in a diff review UI

That is already a real product loop and not just a concept.

## 14. Current Technical Architecture

### Backend stack

Chosen backend stack:

`TypeScript + Node.js`

### Why this backend makes the most sense

1. The product depends heavily on local process orchestration.
2. It needs clean integration with:
   - Codex CLI
   - local files
   - git
   - local speech runtimes such as `whisper.cpp` and Kokoro
3. TypeScript keeps the codebase understandable and maintainable for more developers.
4. The stack is pragmatic for Railway deployment later.
5. It gives us a good balance of speed and safety without overcomplicating iteration.

### Why not Bun, Python, Kotlin, or Rust right now

- Bun is promising but not necessary for this stage.
- Python is better reserved for isolated ML-heavy subsystems if we need them later.
- Kotlin is strong but adds unnecessary stack weight for this product right now.
- Rust is powerful but slows product iteration at this stage.

### Current backend shape

The backend is moving toward:

- thin app/bootstrap layer
- config layer
- feature services
- runtime/session state
- local desktop runtime integration
- pluggable TTS provider path
- Railway-friendly product/backend boundaries

### Frontend direction

The frontend is being rebuilt toward:

- feature-first structure
- smaller containers and presentational components
- better DRY boundaries
- reusable types/utilities
- a UI strongly informed by the Stitch design direction
- a desktop app shell packaged through Electron

### Desktop architecture decision

The chosen app-shell direction is:

`Electron for v1.0`

This is the right tradeoff because the product needs:

1. mature macOS desktop packaging
2. strong local process orchestration
3. reliable coordination with a local runtime
4. clean integration with Codex CLI, local files, and local TTS

The product website is therefore a distribution layer, not the main runtime.

## 15. Trust and Security Model

Trust is central to the product.

### Current trust model

- no automatic project scanning
- manual project root selection
- read-only mode by default
- revocable write access
- approval required before file changes
- visible diff review after changes
- explicit text logs for actions and conversation
- local Codex session required

### Current limitations

- secrets blocking is still policy-based
- harder path-level isolation is still needed
- execution isolation for risky repos is not implemented yet
- approval history needs to become more robust

### Security direction

The product should move toward:

- stronger secret-path enforcement
- excluded path configuration
- isolated worktree or temp-workspace execution options
- clearer audit trail for approvals and actions

## 16. Design Direction

The visual direction should be:

- dark
- premium
- technical
- sharp
- cinematic but disciplined
- operator-console inspired

It should not look like:

- a generic chatbot
- a flat SaaS admin dashboard
- an overdone sci-fi gimmick

The design should support these major surfaces:

1. onboarding / connection
2. workspace setup
3. live voice session
4. terminal / conversation
5. diff review
6. notes / memory
7. macOS desktop settings/runtime surfaces

### Current design reference

The current strongest visual direction comes from the Stitch exports under:

- `stitch_mobile_voice_console/`

Those exports are references, not finished product code.

## 17. Planned Product Expansion

The product is expected to expand in these directions.

### Better voice stack

- stronger transcription
- more human-sounding TTS
- interruption handling
- lower-latency response flow

### In-app Codex connection support

The product should let users enter or follow Codex connection commands directly in the UI rather than relying only on external terminal guidance.

### Notes and memory

The product should include an inbuilt note-taker inspired by Granola.

That means capturing:

- meeting notes
- engineering decisions
- action items
- code-related summaries
- next steps

### Authentication for notes

Google auth is planned for the note-taking layer so users can persist and organize their notes more formally.

### Database

Postgres should be introduced as the durable backend data layer for:

- notes
- sessions
- users
- future approvals history
- future agent tasks

### Deployment

The product is currently local-first, but the medium-term plan is to make it deployable, with Railway as an expected target when the development baseline is ready.

### Multi-agent system

The product is expected to expand into specialist sub-agents such as:

- project manager
- frontend engineer
- backend engineer
- test engineer
- SRE / release engineer

## 18. Why This Product Could Become Sellable

This product becomes sellable if it stops feeling like an internal experiment and starts feeling like a new category of developer tool.

The strongest commercial strengths are:

1. it solves a real workflow problem
2. it has a visually distinctive product story
3. it combines utility and novelty in a credible way
4. it can become habit-forming if the flow is smooth
5. it has a strong trust narrative compared with looser autonomous agents

### Possible commercial angles

- premium solo-developer AI workstation
- trusted voice-native coding operator
- local-first AI engineering console

## 19. Why This Product Could Get Attention Publicly

This product has public attention potential because it can create short demo moments that are easy to understand.

Examples:

- speaking to Codex and seeing code tasks flow naturally
- approving changes with visible diffs
- switching from live voice session to terminal transcript to memory notes
- using the same system from desktop and mobile

For the product to be publicly compelling, it must be:

- understandable in seconds
- visually memorable
- technically believable

## 20. Risks

### Risk 1: Voice quality disappoints

If speech input/output does not feel clearly better than cheap browser tooling, the product loses credibility.

### Risk 2: Security promise is weak

If users think the product can touch sensitive files unexpectedly, trust collapses.

### Risk 3: The UI still looks like a prototype

A strong concept can still fail if the product looks unfinished.

### Risk 4: Positioning becomes muddy

If the product tries to be too many things too early, it will lose its strongest identity.

### Risk 5: Performance breaks the illusion

Voice products are judged harshly on lag, awkward timing, and robotic behavior.

## 21. Immediate Priorities

The strongest next priorities are:

1. finish backend cleanup for maintainability
2. fully rebuild the frontend from the design direction
3. improve speech output quality
4. improve transcription quality
5. add Postgres-backed foundations for note-taking and future auth
6. support Codex connection flows more elegantly in-app

## 21. Guidance for AI Agents or New Team Members

If an AI agent or new human contributor is using this document, they should understand:

1. this is a serious product, not a toy demo
2. trust and approval flow are core requirements
3. voice is primary, but logs and clarity are mandatory
4. design quality matters as much as raw functionality
5. the product should stay coherent as it expands

When proposing improvements, they should optimize for:

- usefulness on real coding tasks
- stronger trust boundaries
- better voice quality
- maintainable architecture
- premium product presentation

They should avoid pushing the product toward:

- generic chatbot UX
- uncontrolled autonomy
- noisy decorative security theater
- bloated feature scope without clear product value

## 22. Website and Launch Narrative Direction

When the product is ready for a public-facing website, the narrative should likely be:

### Hero

Talk to your coding agent. Stay in control of your codebase.

### Problem

AI coding workflows are fragmented, text-heavy, and hard to trust.

### Solution

Voice Codex Local gives developers a voice-native coding operator with workspace control, approval-gated file changes, and visible diffs.

### Trust

Manual project scope, read-only default, explicit approval before writes.

### Future

Notes, memory, multi-agent delegation, and deeper developer workflow support.

## 23. One-Paragraph Pitch

Voice Codex Local is a voice-first AI coding operator that runs with local control, lets developers talk naturally to Codex, keeps every interaction visible in text, constrains the assistant to an explicitly selected workspace, and requires approval before code changes are applied. It is designed to become a trusted spoken software engineering workstation, not just another AI chat window.

## 24. One-Sentence Positioning

Voice Codex Local is a trusted voice-native coding operator for developers who want to talk to an AI engineering partner without giving up control of their codebase.
