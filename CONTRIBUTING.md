# Contributing to mcp-opnsense

Thank you for your interest in contributing!

## Workflow

1. **Issue first** — Create a GitHub issue describing the change before starting work
2. **Fork & branch** — Fork the repo, create a feature branch: `feature/<issue-nr>-<description>`
3. **Develop** — Write code, add tests, update documentation
4. **Test** — Ensure all tests pass: `npm test`
5. **PR** — Create a pull request referencing the issue

## Branch Naming

- `feature/<issue-nr>-<description>` — New features
- `fix/<issue-nr>-<description>` — Bug fixes
- `chore/<description>` — Maintenance tasks

## Commit Messages

Use conventional commits with issue references:

```
feat: add DNS forward management (#12)
fix: handle SSL certificate timeout (#5)
chore: update dependencies
```

## Code Standards

- TypeScript strict mode
- All tool parameters validated with Zod schemas
- No `any` types
- No SSH or shell execution
- Credentials only via environment variables
- Tests for all new tools

## Review

- All PRs require code review before merging
- Tests must pass
- Documentation must be updated (especially README.md)

## After Merge

Branch and worktree cleanup is mandatory after PR merge to prevent drift.
