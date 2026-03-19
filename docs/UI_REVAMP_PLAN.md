# UI Revamp Plan

## Product Manager Framing

### Problem

The current app is functionally stronger than before, but the interface still feels like an internal prototype:

- too many controls are visually equal
- setup, conversation, and review are mixed too closely
- the terminal view does not feel like a real operator console
- onboarding is not sharp enough for first-time use
- the visual language does not yet match an industry-grade voice product

### UX Goals

- [x] Make the flow obvious: connect, set workspace, converse, review
- [x] Split the product into clearer screens instead of one crowded page
- [x] Make the voice interaction feel central, not secondary
- [x] Make terminal and review surfaces feel like real work tools
- [x] Preserve mobile responsiveness

## Designer Direction

### Chosen Visual System

- dark operator-console aesthetic
- left rail navigation for a multi-page feel
- stronger typography hierarchy and tighter spacing
- mac-terminal inspired transcript chrome
- dedicated onboarding launchpad instead of generic card stack
- clearer review surface for approvals and diffs

### Key Design Decisions

- [x] Launchpad onboarding for disconnected state
- [x] Sidebar navigation for connected state
- [x] Dedicated screens for:
  - workspace
  - voice
  - terminal
  - review
- [x] Voice orb remains the hero interaction object
- [x] Terminal transcript now uses a shell-like presentation

## SRE / Delivery Handoff

### Assigned to Senior Frontend Developer

- [x] Refactor render tree to support screen-based navigation
- [x] Keep all existing backend integrations working
- [x] Preserve continuous voice-session behavior
- [x] Preserve approval and diff-review functionality
- [x] Maintain responsive layouts for tablet and mobile

### Remaining UI Follow-Ups

- [ ] Add scroll anchoring for live terminal chat
- [ ] Add diff file tabs for large change sets
- [ ] Add empty-state illustrations or motion accents
- [ ] Add keyboard shortcuts for screen switching
- [ ] Add compact mobile bottom-nav treatment
- [ ] Add user-controlled theme density
