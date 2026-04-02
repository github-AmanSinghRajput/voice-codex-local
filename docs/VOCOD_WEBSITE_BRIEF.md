# VOCOD Website Brief

> This document is the source of truth for the VOCOD marketing website: layout, copy direction, tone, and section-level design intent. It should not override the product guide or release milestones.

## Doc hierarchy

Use the docs in this order:

- `docs/PRODUCT_GUIDE.md`: product truth
- `docs/RELEASE_MILESTONES.md`: roadmap truth
- `docs/VOCOD_WEBSITE_BRIEF.md`: website copy and layout truth
- `README.md`: repo and development truth

If this brief drifts from the product guide or milestones, update this brief.

---

## Brand Identity

**Product name:** VOCOD
**Pronunciation:** "voh-cod" (like "vocal" meets "code")
**Tagline:** Talk to your code. Stay in control.
**One-liner:** The voice-native AI coding operator for macOS.

**Brand personality:**
- Technically sharp — built by engineers, for engineers
- Quietly confident — doesn't need to scream, the product speaks
- A little irreverent — serious tool, doesn't take itself too seriously
- Underground/indie energy — not a corporation, a craft
- Premium but accessible — looks expensive, free to try

**What VOCOD is NOT:**
- Not another chatbot wrapper
- Not a VS Code extension
- Not a browser tab
- Not a toy voice demo
- Not vaporware

**Typography direction:**
- Headlines: geometric sans-serif with weight (Space Grotesk or similar)
- Body: clean, highly readable sans-serif
- Code/mono: JetBrains Mono or similar

**Color direction:**
- Primary background: deep dark (near-black, not pure black — think #08090d range)
- Accent: electric cyan/teal (#68dbff or similar)
- Secondary accent: soft green (#6efbbe) for positive states
- Text: crisp white with muted grays for secondary text
- Error/warning: warm coral (#ff8e98)
- Overall feel: dark operator console, not generic dark mode

**Existing app icon:** Use the current Electron app icon as the logo mark. No separate logo design needed yet.

---

## Website Structure

The site is a single scrolling page with distinct sections. No subpages needed for launch. The entire experience should feel like one continuous story that builds from "what is this" to "I need this" to "let me in."

### Section order:
1. Navigation bar
2. Hero
3. The Problem
4. Product showcase
5. How it works
6. What makes VOCOD different
7. What's coming (roadmap tease)
8. Trust and security
9. Beta access (invite gate)
10. Footer

---

## Section 1: Navigation Bar

**Layout:** Fixed top bar, transparent on hero, transitions to solid dark background on scroll.

**Contents:**
- Left: VOCOD logo mark + wordmark
- Right: anchor links — Features, How it works, Security, Beta Access
- Far right: "Get Beta Access" button (scrolls to invite section)

**Animation:** Nav bar background fades in from transparent to solid as user scrolls past hero.

---

## Section 2: Hero

**Layout:** Full viewport height. Centered content. Subtle animated background (see animation notes below).

**Headline (large, bold):**
```
Talk to your code.
Stay in control.
```

**Subheadline (medium, muted color):**
```
VOCOD is a voice-native AI coding operator for macOS.
Speak naturally. Review every change. Ship with confidence.
```

**CTA button:**
```
Request Beta Access
```
(Scrolls to the beta invite section)

**Secondary line below CTA (small, muted):**
```
macOS only. Invite-only beta. Free during early access.
```

**Hero background animation:**
A slow-moving abstract waveform or particle mesh in the accent color (#68dbff), subtle and atmospheric. Not flashy — think ambient, almost like breathing. This should feel like a system that's alive and listening. Opacity should be low (15-20%) so it doesn't compete with the text.

Alternative: a very subtle audio waveform visualization, gently pulsing as if VOCOD is waiting to hear you speak.

---

## Section 3: The Problem

**Section kicker (small, uppercase, accent color):**
```
THE PROBLEM
```

**Headline:**
```
AI coding tools are stuck in a text box.
```

**Body copy (2-3 short paragraphs, conversational tone):**
```
You open a chat window. You type a prompt. You wait. You read the response.
You copy-paste into your editor. You realize it broke something. You go back
and type another prompt.

Sound familiar?

Most AI coding tools are just chatbots wearing a developer costume. They don't
understand your project structure. They don't ask before touching your files.
They definitely don't let you talk to them like a human being.

Developers deserve better than a glorified autocomplete with a chat bubble.
```

**Animation:** Text fades in paragraph by paragraph as the user scrolls into view. Subtle, not dramatic.

---

## Section 4: Product Showcase

**Section kicker:**
```
THE PRODUCT
```

**Headline:**
```
Meet VOCOD.
Your voice-first coding operator.
```

**Layout:** Large product screenshot or screen recording, centered, with a subtle glow/shadow effect. Below it, a grid of 3-4 feature cards.

**Product visual:** A clean screenshot or short recording of the VOCOD voice session screen with the waveform active, live transcript visible, and the app responding in real time. If a video/GIF is available, use that instead.

**Feature cards (grid of 4):**

**Card 1: Voice-native**
```
Speak naturally. VOCOD transcribes, understands context,
and responds — out loud. No typing required.
Not a gimmick. An actual workflow.
```

**Card 2: Approval-gated**
```
Every file change requires your explicit approval.
See the full diff. Review each file. Accept or reject.
Your repo, your rules.
```

**Card 3: Local-first**
```
VOCOD runs on your Mac. Your code never leaves your machine.
The AI coding agent operates locally — no cloud execution,
no mystery servers touching your files.
```

**Card 4: Multi-provider**
```
Bring your own AI. Connect OpenAI Codex or Anthropic Claude Code
using your existing subscription. No extra API keys.
No per-token billing. $0 on top of what you already pay.
```

**Animation:** Feature cards slide up and fade in as user scrolls, staggered (card 1 first, then 2, 3, 4 with ~100ms delay between each).

---

## Section 5: How It Works

**Section kicker:**
```
HOW IT WORKS
```

**Headline:**
```
Three steps. One download. Zero API keys.
```

**Layout:** Three numbered steps, each with an icon/illustration and short description. Horizontal on desktop, vertical stack on mobile.

**Step 1:**
```
Download VOCOD
Grab the macOS app. One install. Everything you need
ships inside — local speech engine, voice processing,
and the full operator interface.
```

**Step 2:**
```
Connect your AI
Already paying for ChatGPT Plus or Claude Pro?
VOCOD wraps those subscriptions directly.
No API key. No wallet top-up. Your existing login works.
```

**Step 3:**
```
Start talking
Open a project. Start a voice session. Ask questions.
Propose changes. Review diffs. Approve what looks right.
All by voice, all under your control.
```

**Small footnote below steps:**
```
You'll need Codex CLI or Claude Code CLI installed.
VOCOD guides you through setup on first launch.
```

**Animation:** Steps reveal one at a time as user scrolls, with the step number doing a subtle scale-up animation (1.0 → 1.05 → 1.0).

---

## Section 6: What Makes VOCOD Different

**Section kicker:**
```
WHY THIS EXISTS
```

**Headline:**
```
Not another wrapper. Not another extension.
A new surface for how you build software.
```

**Layout:** Two-column layout. Left: text content. Right: comparison table or visual contrast.

**Left column copy:**
```
VOCOD is not a plugin for your IDE. It's not a browser tab you
keep open. It's a standalone macOS application — a dedicated
workspace for thinking, building, and reviewing code with AI.

Most tools give you AI autocomplete or a chat sidebar.
VOCOD gives you a spoken engineering partner that operates inside
your project, proposes changes as reviewable diffs, and waits
for your approval before touching a single file.

Think of it as the cockpit, not the co-pilot.
```

**Right column — comparison list:**

```
The chat tab approach:         VOCOD:
- Type everything              - Speak naturally
- Copy-paste output            - Changes applied in your repo
- Trust blindly                - Review every diff
- No project awareness         - Scoped to your workspace
- Browser tab                  - Dedicated macOS app
- Another subscription         - Uses what you already pay for
```

**Animation:** The comparison list items appear one row at a time, sliding in from left and right respectively.

---

## Section 7: What's Coming

**Section kicker:**
```
THE ROADMAP
```

**Headline:**
```
This is 40% of what we're cooking.
```

**Subheadline:**
```
VOCOD is just getting started. Here's a taste of what's next.
```

**Layout:** Horizontal timeline or stacked cards showing future versions.

**Roadmap items:**

**Now — 0.1 Beta**
```
Voice coding operator. Approval-gated diffs.
Local speech. Multi-provider support.
The foundation.
```

**Next — 0.2**
```
Public-beta readiness. Better packaging, smoother
setup, and a cleaner first-run desktop experience.
```

**Then — 1.0**
```
The first serious public VOCOD launch.
Trustworthy voice coding, strong review flows,
and a polished desktop product.
```

**Later — 1.1 / 1.2**
```
AI-powered meeting notes for developers.
Record engineering discussions. Extract decisions,
action items, and code context automatically.
Your meetings, actually useful.
```

**After that — 2.0**
```
The vibe layer. Developer ambiance. Session-aware
music. Coding mode personalization.
Because building software should feel good.
```

**Bottom line (italic, slightly playful):**
```
We're not announcing everything yet. Some things are better
experienced than described. Stay close.
```

**Animation:** Timeline items fade in sequentially as user scrolls. Each card has a subtle left-border accent that fills in with color as it enters view.

---

## Section 8: Trust and Security

**Section kicker:**
```
TRUST MODEL
```

**Headline:**
```
Your code stays on your machine.
We mean that literally.
```

**Layout:** Grid of trust points, each with a checkmark icon.

**Trust points:**

```
[check] Code execution happens locally
Your AI coding agent runs on your Mac, not our servers.
We never see, store, or transmit your source code.

[check] Read-only by default
VOCOD starts in advisory mode. File changes require you
to explicitly enable write access and approve each change.

[check] Full diff review before execution
Every proposed change shows up as a side-by-side diff.
You see exactly what will change before it happens.

[check] No telemetry on your code
We track product usage (screens viewed, features used)
to improve VOCOD. We never track, log, or analyze
the content of your code or conversations.

[check] Secret file protection
VOCOD blocks access to sensitive files such as .env,
.pem, .key, and credentials at the runtime layer.
Your secrets should stay outside the assistant's reach.

[check] Workspace boundaries
Each session is scoped to a project root you choose.
The AI cannot access files outside that boundary.
```

**Animation:** Checkmarks animate in (draw effect) as each trust point enters the viewport.

---

## Section 9: Beta Access (Invite Gate)

**Section kicker:**
```
EARLY ACCESS
```

**Headline:**
```
VOCOD is in invite-only beta.
```

**Subheadline:**
```
We're rolling out access to developers who want to help
shape the future of voice-native coding. Got an invite code?
```

**Layout:** Centered card with invite code input and submit button.

**Form elements:**
- Text input: placeholder "Enter your invite code"
- Submit button: "Unlock Download"
- Below form: "Don't have a code? Join the waitlist."
- Waitlist link opens a simple email input: "Your email" + "Join Waitlist" button

**On successful invite code:**
The card transforms to show:
```
You're in.

Download VOCOD for macOS
[Download DMG button]

Version 1.0.0-beta · macOS 13+ · Apple Silicon & Intel
```

**On invalid invite code:**
```
That code didn't work. Double-check it or join the waitlist
to get notified when we open more spots.
```

**On waitlist signup:**
```
You're on the list. We'll reach out when your spot opens.
In the meantime, tell a friend who writes code for a living.
```

**Animation:** On successful code entry, the form card does a subtle scale pulse (1.0 → 1.02 → 1.0) and the download button fades in with a gentle glow effect.

---

## Section 10: Footer

**Layout:** Simple, dark, minimal.

**Left side:**
```
VOCOD
Built for developers who talk to their tools.
```

**Right side — links (keep minimal):**
```
GitHub (if public)
Twitter / X
Contact: hello@vocod.dev (or whatever domain you get)
```

**Bottom line:**
```
Made with voice, code, and an unreasonable amount of coffee.
2026 VOCOD. All rights reserved.
```

---

## Global Animation Guidelines

**General principles:**
- Every animation should feel intentional, not decorative
- Use `prefers-reduced-motion` media query — disable all motion for users who set this
- Default easing: `cubic-bezier(0.22, 1, 0.36, 1)` (smooth deceleration)
- Default duration: 400-600ms for reveals, 200ms for hover states
- Scroll-triggered animations: use IntersectionObserver, trigger when element is 15-20% visible
- No animation should repeat on re-scroll — trigger once only

**Specific animations:**
1. Hero background: continuous ambient motion (CSS animation, GPU-accelerated)
2. Section reveals: elements fade in + translate up 20px as they enter viewport
3. Feature cards: staggered reveal (100ms delay between cards)
4. Comparison table: rows slide in from opposite sides
5. Roadmap: sequential reveal with border-color fill
6. Trust checkmarks: SVG path draw animation
7. Beta form success: scale pulse + glow
8. Hover states on buttons: subtle lift (translateY -2px) + border color shift
9. Nav bar: background opacity transition on scroll

**Performance rules:**
- Only animate `transform` and `opacity` (never animate layout properties)
- Use `will-change` sparingly and only on animated elements
- No JavaScript-driven scroll hijacking — let the browser handle scrolling
- Lazy load any heavy assets (images, videos) below the fold

---

## SEO Requirements

**Page title:**
```
VOCOD — The Voice-Native AI Coding Operator for macOS
```

**Meta description:**
```
Talk to your AI coding agent naturally. Review every file change before it happens. VOCOD is a local-first macOS app that wraps your existing AI subscription into a voice-first engineering workflow. Invite-only beta.
```

**Open Graph tags:**
```
og:title        → VOCOD — Talk to your code. Stay in control.
og:description  → Voice-native AI coding operator for macOS. Approval-gated diffs. Local execution. Free during beta.
og:image        → [Product screenshot or branded hero image, 1200x630px]
og:type         → website
og:url          → https://vocod.dev (or current domain)
```

**Twitter card:**
```
twitter:card         → summary_large_image
twitter:title        → VOCOD — Talk to your code. Stay in control.
twitter:description  → Voice-native AI coding operator for macOS. Invite-only beta.
twitter:image        → [Same as og:image]
```

**Semantic HTML requirements:**
- One `<h1>` only (the hero headline)
- Proper heading hierarchy: h1 → h2 (section headlines) → h3 (card titles)
- Use `<section>` with `aria-label` for each major section
- Use `<nav>` for navigation
- Use `<footer>` for footer
- Alt text on all images
- Semantic `<button>` for actions, `<a>` for navigation

**Target keywords (natural integration, not keyword stuffing):**
- voice coding assistant
- AI coding operator
- voice-first developer tool
- macOS coding app
- AI code review
- voice-native IDE alternative
- talk to AI coding agent

**Structured data (JSON-LD):**
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "VOCOD",
  "operatingSystem": "macOS",
  "applicationCategory": "DeveloperApplication",
  "description": "Voice-native AI coding operator for macOS",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "availability": "https://schema.org/LimitedAvailability"
  }
}
```

---

## Analytics Requirements

**Analytics provider:** Use a privacy-respecting analytics tool. Recommended: **Plausible** (paid, lightweight, no cookies) or **Umami** (free, self-hostable). Avoid Google Analytics for developer audience — many developers block it, and it requires cookie consent banners.

If budget is $0, use **Umami** self-hosted on Vercel (free) or use the Vercel built-in analytics (free tier).

**Events to track:**

**Page-level:**
- Page view (automatic)
- Scroll depth (25%, 50%, 75%, 100%)
- Time on page
- Referrer source

**Interaction events:**
```
event: nav_click
  props: { target: "features" | "how_it_works" | "security" | "beta_access" }

event: cta_hero_click
  props: { location: "hero" }

event: invite_code_submitted
  props: { success: boolean }

event: download_dmg_clicked
  props: { version: "1.0.0-beta" }

event: waitlist_signup
  props: { }

event: feature_card_viewed
  props: { card: "voice" | "approval" | "local" | "multi_provider" }

event: roadmap_section_viewed
  props: { }

event: trust_section_viewed
  props: { }
```

**UTM support:**
The site should read and preserve UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`) and attach them to any form submission (invite code, waitlist). This lets you track which channels drive signups.

**No tracking that requires:**
- Cookie consent banners
- Personal data collection beyond email (for waitlist only)
- Third-party tracking pixels

---

## Tone of Voice Reference

Use these examples to calibrate the writing style across the site. The voice should feel like a sharp developer friend explaining their side project at a bar — knowledgeable, enthusiastic, a bit funny, never corporate.

**Do say:**
- "Your code stays on your machine. We mean that literally."
- "This is 40% of what we're cooking."
- "No extra API keys. No wallet top-ups. $0 on top of what you already pay."
- "Think of it as the cockpit, not the co-pilot."
- "Made with voice, code, and an unreasonable amount of coffee."

**Don't say:**
- "Leveraging cutting-edge AI technology to revolutionize developer workflows"
- "Our state-of-the-art solution empowers developers"
- "Seamlessly integrate AI into your development pipeline"
- "Unlock the full potential of your coding experience"
- Any sentence that could appear in a corporate press release

**The golden rule:** If you read a line out loud and it sounds like a LinkedIn post, rewrite it.

---

## Mobile Considerations

- The site must be fully responsive
- Hero text scales down but remains impactful on small screens
- Feature cards stack to single column on mobile
- Comparison table becomes two stacked lists (not side-by-side)
- Product screenshot scales with aspect ratio preserved
- Beta access form should be full-width on mobile
- Navigation collapses to hamburger menu on mobile
- All touch targets minimum 44x44px

---

## Technical Implementation Notes (for the developer building this)

**Stack recommendation:**
- Static site generator (Astro, Next.js static export, or vanilla HTML/CSS/JS)
- Deploy to Vercel (free)
- No CMS needed for launch
- CSS: prefer vanilla CSS with custom properties over Tailwind for this (matches the product's design system)

**Performance targets:**
- Lighthouse score: 95+ across all categories
- First Contentful Paint: < 1.2s
- Total page weight: < 500KB (excluding hero video if used)
- No render-blocking JavaScript above the fold

**Accessibility:**
- WCAG 2.1 AA minimum
- Keyboard navigable
- Screen reader friendly
- Color contrast ratios meeting AA standards
- Focus indicators visible

---

## Content Summary — All Headline Copy in One Place

For quick reference, here's every headline on the page:

```
NAV:       VOCOD | Features | How it works | Security | Beta Access | [Get Beta Access]

HERO:      Talk to your code. Stay in control.
           VOCOD is a voice-native AI coding operator for macOS.

PROBLEM:   AI coding tools are stuck in a text box.

PRODUCT:   Meet VOCOD. Your voice-first coding operator.

HOW:       Three steps. One download. Zero API keys.

DIFFERENT: Not another wrapper. Not another extension.
           A new surface for how you build software.

ROADMAP:   This is 40% of what we're cooking.

TRUST:     Your code stays on your machine. We mean that literally.

BETA:      VOCOD is in invite-only beta.

FOOTER:    Built for developers who talk to their tools.
```
