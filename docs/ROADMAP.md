# Roadmap

## Phase 1: Safe Local Operator

- [x] Use local Codex login instead of API keys
- [x] Add project root selection
- [x] Add write access revoke/grant control
- [x] Require explicit approval before writes
- [x] Show changes with a git diff viewer
- [x] Keep type + voice chat together

## Phase 2: Better Voice Stack

- [ ] Replace browser speech recognition with a clearer streaming STT path
- [ ] Add VAD-based turn segmentation instead of browser lifecycle heuristics
- [ ] Improve speaking voice quality
- [ ] Add interruption handling while Codex is speaking
- [ ] Support voice approvals and voice cancellations

## Phase 3: Coding Agent Expansion

- [ ] Add sub-agents:
- [ ] Project manager
- [ ] Frontend developer
- [ ] Backend developer
- [ ] Test engineer
- [ ] SRE / release engineer
- [ ] Add task queue and long-running task monitor
- [ ] Add test/run/build execution controls with approvals
- [ ] Add better repo awareness for the selected workspace only

## Phase 4: Harder Security Boundaries

- [ ] Stronger blocking around `.env`, keys, and secret-like paths
- [ ] Safer write execution model for sensitive repos
- [ ] Workspace isolation or temp-worktree execution
- [ ] Better audit log for approvals and applied changes

