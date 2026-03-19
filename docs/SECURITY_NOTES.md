# Security Notes

## Current Safety Model

- [x] Codex runs only when the local CLI session is logged in
- [x] File-changing runs are blocked unless write access is enabled
- [x] File-changing runs require explicit approval before execution
- [x] Project root is selected manually instead of scanned automatically
- [x] User can revoke write access
- [x] User can log out of Codex

## Current Limitations

- [ ] Browser speech recognition is not the strongest transcription path
- [ ] Secret-file protection is policy-based right now, not a fully hardened sandbox
- [ ] Voice confirmation for file writes is not implemented yet
- [ ] Diff review is strongest for git repos

## Next Security Work

- [ ] Add stronger secret-path enforcement
- [ ] Add excluded path configuration per project
- [ ] Add temp-worktree or isolated execution mode
- [ ] Add approval history with timestamps and executed task summaries

