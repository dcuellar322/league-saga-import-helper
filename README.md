# LeagueSaga Import Helper

LeagueSaga Import Helper is an open source desktop app for importing ESPN fantasy football league
data into LeagueSaga without asking users to paste ESPN cookies into a web form.

Cuellar Labs LLC operates LeagueSaga and distributes the Import Helper.

The app opens ESPN in an isolated Electron session, lets the user sign in directly with ESPN,
fetches fantasy league data locally, converts it into a validated LeagueSaga import bundle, and
uploads only the reviewed fantasy data to LeagueSaga.

This project is independent. It is not affiliated with, endorsed by, sponsored by, or approved by
ESPN, Disney, or the NFL. Your use of ESPN remains subject to ESPN's and Disney's terms.

## Features

- Sign in to ESPN inside a dedicated helper app session.
- Keep ESPN passwords and raw session cookies local to the helper.
- Validate import data against a shared TypeScript/Zod contract.
- Export the generated JSON bundle before uploading.
- Review teams and owners in human-readable form and include or exclude rosters, matchups, draft picks, and transactions.
- Upload a validated bundle to a LeagueSaga preview endpoint.
- Return directly to the LeagueSaga preview after a successful upload when the API supplies a continuation URL.
- Clear the helper's ESPN session from inside the app.
- Save a rotating privacy-safe diagnostic log and check for signed releases.

## Privacy and Security

- The helper does not read Chrome, Safari, Firefox, or system browser cookie stores.
- The helper does not upload raw ESPN cookies to LeagueSaga.
- ESPN cookies are used locally only to request fantasy data from ESPN.
- Import bundles can include league, team, roster, matchup, draft, and transaction data returned by ESPN.

See [docs/PRIVACY.md](docs/PRIVACY.md), [docs/SECURITY.md](docs/SECURITY.md), and
[docs/THIRD-PARTY-SERVICES.md](docs/THIRD-PARTY-SERVICES.md) for more detail.

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer

## Development

Install dependencies:

```bash
npm install
```

Run the desktop app in development:

```bash
npm run dev
```

The helper points to `http://localhost:15173` in local development and
`https://portal.leaguesaga.com` in packaged production builds. The API URL and import token are
runtime session details, so they are not edited in the app UI. Packaged builds reject localhost,
the marketing hostname, and unrelated upload origins.

Run type checks:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Run tests with the coverage gate:

```bash
npm run test:coverage
```

The unit coverage gate includes the deterministic import, validation, security, settings, cookie-session,
diagnostics, and renderer-helper modules. Electron lifecycle and React rendering entry points are validated
through packaged smoke tests rather than counted as unit-covered code.

Run linting and formatting checks:

```bash
npm run lint
npm run format:check
```

Run the complete local quality suite:

```bash
npm run quality
```

Build the app:

```bash
npm run build
```

Create a local packaged app directory:

```bash
npm run package
```

Build distributable installers:

```bash
npm run make
```

macOS and Windows release builds should be signed before public distribution.
The tag release workflow refuses to publish without signing credentials and produces macOS x64/arm64, Windows x64, and Linux x64 artifacts.

## Launching From LeagueSaga

LeagueSaga can prefill an import session by opening the app with the registered custom protocol:

```text
leaguesaga-import://start?apiBase=https%3A%2F%2Fportal.leaguesaga.com&token=<one-time-import-token>&leagueId=<espn-league-id>&season=2025&importSessionId=<session-id>
```

Supported query parameters:

- `token`: short-lived, one-time LeagueSaga import token
- `importSessionId`: optional non-secret import session identifier included in bundle metadata
- `leagueId`: numeric ESPN league ID
- `season`: optional ESPN season start year, for example `2025`
- `apiBase`: optional LeagueSaga API base URL

LeagueSaga should include `season` whenever the import flow has a season start year. If it is omitted, the helper uses the prior year before June and the current year from June onward. Manual users can paste a complete ESPN league URL to extract both the ID and season.

## Repository Layout

```text
apps/desktop/             Electron, Vite, and React desktop app
packages/import-contract/ Shared TypeScript/Zod import contract
docs/                     Privacy, security, and release notes
scripts/                  Maintenance scripts
```

## Import Contract

The shared `@leaguesaga/import-contract` package defines the normalized import bundle schema. ESPN response shapes can change, so ESPN-specific parsing should stay inside `apps/desktop/src/main/espn/transform.ts` while the shared contract remains stable or is intentionally versioned.

## Security Reports

Please do not open public issues for vulnerabilities. Use the repository's private security advisory form described in [docs/SECURITY.md](docs/SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
