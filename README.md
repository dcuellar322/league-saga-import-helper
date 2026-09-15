# LeagueSaga Import Helper

LeagueSaga Import Helper is an open source, provider-aware desktop app for importing fantasy football
league data into LeagueSaga without asking users to paste credentials into a web form. The current
release includes the production ESPN adapter; Yahoo and Sleeper are represented in the flow as
upcoming adapters.

Cuellar Labs LLC, a Texas limited liability company doing business as LeagueSaga, maintains this
repository, distributes the official LeagueSaga Import Helper releases, and operates the LeagueSaga
service that receives reviewed imports.

The app opens ESPN in an isolated Electron session, lets the user sign in directly with ESPN,
fetches fantasy league history locally, converts every season into a validated LeagueSaga history
package, and uploads only the reviewed fantasy data to LeagueSaga.

This project is independent. It is not affiliated with, endorsed by, sponsored by, or approved by
ESPN, Disney, or the NFL. Your use of ESPN remains subject to ESPN's and Disney's terms.

## Features

- Import from ESPN in a five-step flow; Yahoo and Sleeper are visible as disabled upcoming providers.
- Sign in to ESPN inside a dedicated helper app session.
- Keep ESPN passwords and raw session cookies local to the helper.
- Validate import data against a shared TypeScript/Zod contract.
- Discover and import every ESPN season linked to a league, or limit history with an optional start year.
- Export the generated historical JSON package before uploading.
- Review teams and owners in human-readable form and include or exclude rosters, matchups, draft picks, and transactions.
- Upload a validated historical package to a LeagueSaga preview endpoint.
- Return directly to the LeagueSaga preview after a successful upload when the API supplies a continuation URL.
- Clear the helper's ESPN session from inside the app.
- Save a rotating privacy-safe diagnostic log and download app updates from the official release channel from Settings.

## Privacy and Security

- The helper does not read Chrome, Safari, Firefox, or system browser cookie stores.
- The helper does not upload raw ESPN cookies to LeagueSaga.
- ESPN cookies are used locally only to request fantasy data from ESPN.
- Historical import packages can include league, team, roster, matchup, draft, and transaction data returned by ESPN for every discovered season. For seasons from 2018 onward, the helper checks every ESPN scoring period for transaction events and resolves referenced player names when ESPN exposes them.

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

The coverage gate includes the deterministic import, validation, security, settings, cookie-session,
diagnostics, IPC, React wizard, workflow reducer, and renderer lifecycle modules. Thin Electron and React
bootstrap entry points are validated through packaged smoke tests rather than counted as unit-covered code.

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
The tag release workflow requires signing credentials and stages a draft release with macOS x64/arm64 and Linux x64 packages.
The manual release workflow also supports Linux-only builds and optional signed Windows builds.
See [Linux installation](docs/LINUX.md) for supported systems and package instructions.

See [CHANGELOG.md](CHANGELOG.md) for notable changes and the [Release Guide](docs/RELEASES.md)
for release preparation and verification.

## Launching From LeagueSaga

LeagueSaga can prefill an import session by opening the app with the registered custom protocol:

```text
leaguesaga-import://start?apiBase=https%3A%2F%2Fportal.leaguesaga.com&token=<one-time-import-token>&leagueId=<espn-league-id>&startYear=2020&importSessionId=<session-id>
```

Supported query parameters:

- `token`: short-lived, one-time LeagueSaga import token
- `importSessionId`: optional non-secret import session identifier included in package metadata
- `leagueId`: numeric ESPN league ID
- `startYear`: optional ESPN season start year, for example `2020`; omit it to import every linked season
- `apiBase`: optional LeagueSaga API base URL

LeagueSaga should include `startYear` when the user wants to limit imported history. If it is omitted, the helper discovers every linked season reported by ESPN. Manual users can paste a complete ESPN league URL to extract both the ID and its season as the starting year.

## Repository Layout

```text
apps/desktop/             Electron, Vite, and React desktop app
packages/import-contract/ Shared TypeScript/Zod import contract
docs/                     Privacy, security, and release notes
scripts/                  Maintenance scripts
```

## Import Contract

The shared `@leaguesaga/import-contract` package defines the provider-neutral `0.3.0` history
package. Each season is validated independently and carries transaction coverage, authoritative
team counters, trade-partner counts, and player movement events.
Provider response shapes can change, so provider-specific parsing stays inside its adapter while
the public contract remains stable or is intentionally versioned.

See [History Import Format](docs/IMPORT_FORMAT.md) for the documented fields, privacy boundary,
version policy, example document, and generated JSON Schemas.

## Open Source

Cuellar Labs LLC maintains this public project and publishes its official desktop releases through
this repository's [GitHub Releases](https://github.com/dcuellar322/league-saga-import-helper/releases).
The desktop package also identifies Cuellar Labs LLC as its author and maintainer.

This repository is the public client and integration boundary. It does not contain LeagueSaga's
database schema, persistence models, billing rules, or server authorization implementation. See
[Open-Source Boundary](docs/OPEN_SOURCE.md) for the publication checklist and scope.

## Security Reports

Please do not open public issues for vulnerabilities. Use the repository's private security advisory form described in [docs/SECURITY.md](docs/SECURITY.md).

## License

MIT. See [LICENSE](LICENSE), which records the copyright notice for the source code.
See [Open-Source Boundary](docs/OPEN_SOURCE.md) for the company's role and the scope of this repository.
