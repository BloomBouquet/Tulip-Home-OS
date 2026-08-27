# Team Tulip CI Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reproducible GitHub Actions verification gate that installs the workspace dependencies and proves core tests, TypeScript checks, and the real Next.js production build.

**Architecture:** Use a single Ubuntu/Node 22 job on pull requests and pushes to `main`. The workflow installs the pnpm version declared by the repository, installs workspace dependencies without requiring an existing lockfile, runs the existing offline/core gates, and then runs the full `pnpm verify` production gate.

**Tech Stack:** GitHub Actions, Node.js 22, Corepack, pnpm 10.15.0, TypeScript 5.8+, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-08-27-team-tulip-personal-home-os-design.md`

## Global Constraints

- Keep commit messages in English.
- CI must run on pull requests and pushes to `main`.
- The workflow gets only `contents: read` permission.
- Node version is 22.
- pnpm version is 10.15.0, matching `packageManager`.
- Existing 91 core behavior tests remain part of the gate.
- The actual `next build` must execute inside CI.

---

### Task 1: Make the workspace compiler reproducible

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: root `typescript` binary available to workspace scripts.

- [x] Add `typescript@^5.8.0` as a root devDependency.
- [ ] Verify installation in GitHub Actions.

### Task 2: Add CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: root pnpm scripts.
- Produces: pull-request and `main` verification status.

- [ ] Checkout repository.
- [ ] Configure Node.js 22.
- [ ] Activate pnpm 10.15.0 with Corepack.
- [ ] Install workspace dependencies.
- [ ] Run `npm run verify:core`.
- [ ] Run `npm run typecheck:web:offline`.
- [ ] Run `pnpm verify` to execute real TypeScript and Next.js production build gates.

### Task 3: Review first workflow run

- [ ] Open a PR for `team-tulip/ci-verification`.
- [ ] Inspect workflow jobs and logs.
- [ ] Fix any code/configuration error exposed by the real build.
- [ ] Re-run until the GitHub check is green.
- [ ] Merge only after the remote verification gate passes.
