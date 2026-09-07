# Agent Workspace Safety

## Worktrees and dependencies

- Use an explicit working directory and verify the Git branch before editing.
- Delegate work only within the assigned worktree and file scope.
- Never remove a worktree containing junctions, symlinks, or other reparse points.
  In particular, do not run `git worktree remove --force` on a worktree with
  linked `node_modules`: workspace package links can lead back to source files.
- Delegates must not clean up worktrees or shared dependencies. Leave temporary
  worktrees in place and report their paths to the coordinating agent.
- Do not run dependency installation, pruning, or recursive cleanup through a
  shared dependency junction. Coordinate any dependency repair first.
- Before any approved cleanup, inspect links without following them, verify
  resolved paths, and detach only link objects using a nonrecursive operation.
  If link behavior is uncertain, stop rather than attempt recursive removal.
- Report unexpected source changes or missing files immediately. Do not restore,
  overwrite, merge, or push them without resolving ownership with the user.

## Test and deployment boundaries

- Main checkout environment files may target production. Do not use or copy
  them for local UI tests; use the isolated fixtures and their environment guards.
- Preserve unrelated changes and untracked files.
- Do not push, deploy, run migrations, send email, or mutate live business data
  unless the current task explicitly authorizes it.
