# Security Model

The LeagueSaga Import Helper is intentionally designed to avoid the most concerning version of this workflow: reading the user's existing browser cookies.

## What the helper does

- Opens ESPN in an isolated Electron session controlled by this app.
- Lets the user sign in directly with ESPN.
- Reads only the cookies created inside the helper's own ESPN session.
- Uses those cookies locally to request ESPN fantasy data.
- Converts ESPN responses to the shared LeagueSaga import contract.
- Uploads only the normalized, reviewed historical import package to LeagueSaga.

## What the helper does not do

- It does not read Chrome, Safari, Firefox, Edge, Keychain, Credential Manager, or system browser storage.
- It does not upload raw ESPN cookies to LeagueSaga.
- It does not log cookie values.
- It does not persist short-lived LeagueSaga import tokens to the settings file.
- It does not persist ESPN session cookies after the user clicks **Clear ESPN Session**.
- It does not bypass ESPN authentication.

## Electron hardening

The app follows the main Electron security recommendations:

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- deny permission requests by default
- restricted external navigation
- runtime validation on IPC inputs
- credential-like field and known cookie/header pattern checks on completed import packages
- restricted LeagueSaga API upload destinations
- restrictive Content Security Policy for the renderer
- Electron fuses configured for packaged builds

Packaged builds upload only to `https://portal.leaguesaga.com`. The marketing and apex
hostnames are not accepted as API upload or continuation origins. Localhost is accepted only by
unpackaged development builds.

Packaged builds disable `RunAsNode`, `NODE_OPTIONS`, CLI inspector arguments, browser-specific V8 snapshots, and extra `file://` privileges. They enable cookie encryption, embedded ASAR integrity validation, and loading application code only from the signed ASAR. The renderer is served through the app's restricted `app://bundle` protocol.

## Logging policy

Do not log:

- ESPN cookie values
- LeagueSaga import tokens
- full request headers
- raw ESPN response payloads unless behind an explicit developer-only flag

The optional diagnostics export contains timestamps, event names, result codes, and aggregate record counts. Its writer rejects fields whose names indicate tokens, cookies, secrets, passwords, headers, payloads, or responses and rotates the local log at 1 MB.

## Data uploaded to LeagueSaga

The app uploads a versioned `LeagueSagaHistoryImport` JSON document. It contains normalized league,
settings, team, roster, matchup, draft, and transaction data. It does not contain raw provider
response objects, arbitrary provider settings, ESPN session cookies, or passwords. See
[History Import Format](IMPORT_FORMAT.md) for the complete public boundary.

## Recommended release posture

Before sending to non-technical beta users, treat these items as release blockers:

1. Publish the helper source publicly.
2. Sign and notarize macOS x64 and arm64 builds.
3. Sign Windows builds.
4. Publish SHA-256 checksums with each GitHub release.
5. Run the installed deep-link and production-preview smoke test.
6. Keep an easy-to-read privacy page linked from both the helper and LeagueSaga's import screen.

## Reporting a vulnerability

Do not include credentials, tokens, cookies, or raw ESPN payloads in a report. Submit a private report through [GitHub's private security advisory form](https://github.com/dcuellar322/league-saga-import-helper/security/advisories/new). If that form is unavailable, contact the repository owner privately through the GitHub profile rather than opening a public issue.
