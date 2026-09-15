# LeagueSaga Import Helper Agent Guide

This guide defines how agents should implement, validate, and hand off changes in this repository.
It adapts the LeagueSaga working principles to the public Electron desktop helper.

## Project Layout

- `apps/desktop/src/main/`: Electron lifecycle, privileged IPC handlers, validation, uploads,
  settings, diagnostics, and signed updates.
- `apps/desktop/src/main/espn/`: isolated ESPN login session, provider requests, history discovery,
  and normalization.
- `apps/desktop/src/preload/`: the restricted bridge between the renderer and main process.
- `apps/desktop/src/renderer/`: React UI, import state, hooks, and styles.
- `apps/desktop/src/shared/`: shared IPC types, environment rules, and input parsing.
- `packages/import-contract/`: public TypeScript/Zod history contract and schema generation.
- `schemas/`: generated JSON Schemas for external consumers.
- `docs/`: import format, privacy, security, public scope, and release procedures.
- `scripts/`: maintenance, version checks, and production upload smoke test.
- `.github/workflows/`: CI, signed release builds, notarization status, and publication checks.
- `CHANGELOG.md`: curated changes in Keep a Changelog format.

## Working Principles

- Choose the simplest implementation that fully meets the current requirements.
- Prefer platform APIs and existing, maintained dependencies before adding a package or custom
  implementation. Follow nearby patterns before introducing abstractions.
- Keep changes scoped. Preserve unrelated working-tree changes and avoid opportunistic refactors.
- Read the relevant code, documentation, configuration, and tests before coding. Use executable
  configuration to verify how the app works; update stale documentation deliberately.
- This repository uses `docs/` for its documented contracts and operating rules. Update the affected
  documents with behavior changes rather than assuming LeagueSaga's separate `specs/` tree exists here.
- Preserve compatible public contracts. Reuse schemas, types, enums, and constants instead of
  duplicating them. Coordinate changes that affect the receiving LeagueSaga application.
- For asynchronous imports, consider cancellation, expired sessions, retries, duplicate actions,
  stale results, progress reporting, and cleanup of windows, listeners, and network resources.
- Keep the public helper independent of LeagueSaga's private database, billing, and authorization
  implementation. Follow `docs/OPEN_SOURCE.md`.

### Writing Standard

- Use Simplified Technical English as a practical plain-language guide, without claiming formal
  ASD-STE100 conformance.
- Apply William Zinsser's principles: simplicity, brevity, clarity, and humanity. Use familiar
  words, active voice, short paragraphs, and a warm, direct tone.
- Lead with the outcome or next action. Remove filler and keep terminology consistent across
  headings, buttons, help text, errors, documentation, and release notes.
- Explain errors and the next step. Name the action on buttons. Keep implementation details out of
  product copy unless users need them to make a decision.
- Preserve precise privacy and security language. Do not imply that an unavailable provider,
  unpublished download, or unverified release is ready.
- Describe Cuellar Labs LLC consistently as the repository maintainer, official helper distributor,
  and LeagueSaga service operator. Keep company roles distinct from the copyright notice in `LICENSE`.
- Update affected copy assertions and documentation when wording changes. Read the final flow as a user.

## Privacy and Security Boundaries

- Access ESPN credentials only through the helper's own isolated session. Never read the user's
  browser cookie stores, system credential stores, or unrelated sessions.
- Keep provider passwords and raw cookies local. Never include them, import tokens, full launch
  links, request headers, or private provider payloads in logs, fixtures, screenshots, or commits.
- Upload only the normalized, validated history package that the user reviewed. Preserve checks
  that reject credential-like fields and raw provider response objects.
- Keep packaged uploads and continuation URLs restricted to `https://portal.leaguesaga.com`.
  Local development exceptions must remain unavailable in packaged builds.
- Treat deep links, renderer IPC arguments, provider responses, and returned URLs as untrusted
  inputs. Validate them at their receiving boundary, even when TypeScript types exist.
- Preserve context isolation, renderer sandboxing, disabled Node integration, restrictive CSP,
  navigation restrictions, denied permissions, and packaged Electron fuses.
- Expose narrow, typed preload methods. Do not expose unrestricted IPC, filesystem, shell, or
  network access to the renderer.
- Keep import tokens out of persistent settings. Preserve Clear ESPN Session behavior and sanitize
  diagnostic events before writing them.
- Preserve league and season identity through normalization. Report missing or partial provider
  coverage honestly; never invent records to make an import appear complete.

## Code Standards

- Use the existing TypeScript, React, Vite, Electron, and npm workspace patterns. Keep TypeScript
  strictness and use runtime validation at trust boundaries.
- Keep privileged operations in the main process, provider parsing in its adapter, and UI behavior
  in focused renderer components and hooks. Keep preload small and explicit.
- Keep workflow transitions in the existing state model. Avoid parallel sources of truth for
  loading, cancellation, review, upload, and error states.
- Use explicit resource ownership and cleanup. Prevent an old request or session from updating a
  newer import, and do not replay one-time uploads blindly after an uncertain response.
- Preserve accessibility, keyboard navigation, readable status messages, and layouts that work at
  small window sizes. Visually verify material UI changes using the actual application.
- Explain non-obvious intent and tradeoffs in comments; do not narrate obvious code.
- Use npm and update `package-lock.json` when dependencies change. Avoid unrelated lockfile churn.
- Use system temporary directories for investigation scripts and disposable artifacts. Do not
  commit credentials, signing material, local configuration, logs, coverage, or packaged outputs.

### Import Contract

- Treat `packages/import-contract/` and `docs/IMPORT_FORMAT.md` as the public integration boundary.
  Provider-specific response shapes belong in adapters, not the interchange format.
- Update schema source, relevant fixtures and tests, generated JSON Schemas, and format documentation
  together when the contract changes. Generate schemas through `npm run build:contract`.
- Version the app and import contract independently. An app-only patch must not bump the contract
  solely to match the app version. Preserve the release version consistency checks.
- Keep imports deterministic for the same provider facts and options. Preserve external IDs,
  provenance, coverage warnings, and the user's selected data categories.

## Testing and Validation

- Tests must prove useful behavior: contracts, import transformations, privacy boundaries, failure
  handling, state transitions, or a realistic regression. Do not test library internals to raise coverage.
- Assert observable outcomes. Mock genuine seams such as ESPN HTTP, Electron APIs, upload endpoints,
  clocks, and updater APIs. Do not add production branches or abstractions solely for tests.
- Use sanitized or synthetic fixtures. Cover partial history, expired sessions, rejected destinations,
  and stale or repeated actions in proportion to the change.
- Start with the smallest relevant test selection, then broaden checks based on regression risk.
  Documentation-only changes need formatting and diff checks, not new behavioral tests.
- Run commands from the repository root:

```bash
npm ci
npm test -- apps/desktop/src/path/to/feature.test.ts
npm run lint
npm run format:check
npm run test:coverage
npm run typecheck
npm run build
```

`npm run quality` combines lint, formatting, coverage, type checking, and build checks.
CI also runs `npm audit --omit=dev` and `npm run package`. Use packaged checks for changes to
Electron startup, preload, deep links, fuses, or packaging; unit tests alone do not prove those paths.

## Releases and Changelog

- Follow `docs/RELEASES.md`. Master pushes run CI; version tags trigger release builds. Do not create
  tags or publish releases as a side effect of an ordinary code change.
- Preserve required signing, Mac notarization, both Mac architecture checks, checksums, updater
  metadata validation, and matching production-preview evidence before publication.
- A tag, successful compilation, or pending notarization is not a verified public release. Report
  the actual state and do not bypass release gates to make a download available sooner.
- Production smoke tests use a fresh, one-time session and synthetic data. Follow the release guide
  for secret handling; do not use real league data or commit a preview as part of a smoke test.
- Add notable changes under `Unreleased` in `CHANGELOG.md`, using Keep a Changelog 1.1.0 categories.
  Record release versions and actual publication dates when published, and maintain comparison links.

## Git and GitHub

- Use `gh` for GitHub operations. If sandbox isolation causes an apparent authentication failure,
  use the approved escalation flow to verify host access before asking the user to sign in again.
  Never print credential values.
- Use Conventional Commits for commit subjects and PR titles. Keep commits focused and reviewable.
- Do not commit, push, create a PR, merge, tag, or publish unless the user requests that action.
- Do not add AI attribution or `Co-Authored-By` trailers.
- Respect `.github/CODEOWNERS`; review ownership does not itself enforce a required approval.

## Change Summary

Keep handoffs proportional to the work and cover:

- **Documentation/contracts**: affected behavior rules, format documentation, and changelog entries.
- **Implementation**: what changed and why.
- **Verification**: commands run, results, and any checks that remain unverified.
- **Risks/follow-ups**: compatibility, packaging, release concerns, or `None`.
