# Security Notes

## Current Safety Model

- [x] Codex runs only when the local CLI session is logged in
- [x] The real coding/runtime layer is intended to stay on the user's Mac
- [x] File-changing runs are blocked unless write access is enabled
- [x] File-changing runs require explicit approval before execution
- [x] Project root is selected manually instead of scanned automatically
- [x] User can revoke write access
- [x] User can log out of Codex
- [x] Project root is explicit before coding actions run
- [x] Voice and text interactions remain visible in the UI as text
- [x] Spoken audio is treated as transient, not durable product data

## Current Limitations

- [ ] Secret-file protection is policy-based right now, not a fully hardened sandbox
- [ ] Voice confirmation for file writes is not implemented yet
- [ ] Diff review is strongest for git repos
- [ ] Notes/auth/database layers are not separated yet because Postgres and Google auth are still future work
- [ ] Desktop packaging and local-runtime security boundaries are not finalized yet
- [ ] Browser development-shell speech behavior may differ slightly from the final packaged macOS app

## Next Security Work

- [ ] Add stronger secret-path enforcement
- [ ] Add excluded path configuration per project
- [ ] Add temp-worktree or isolated execution mode
- [ ] Add approval history with timestamps and executed task summaries
- [ ] Define auth boundaries clearly once Google auth for note-taking is introduced
- [ ] Make transient audio cleanup a hard invariant in the desktop packaging flow
- [ ] Define what text/metadata syncs to Railway and what always stays local
- [ ] Harden local-runtime to cloud-backend communication for the desktop app
