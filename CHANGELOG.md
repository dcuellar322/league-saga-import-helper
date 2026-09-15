# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Optional self-signed Windows VM test bundles with a public certificate, verified signature, and installation guide.

- Unsigned Windows x64 MSIX submission packages with Store identity validation, protocol registration, and Windows packaging checks.

### Changed

- Microsoft Store installations delegate updates to the Store and reject GitHub installer downloads and restarts.
- Refresh the mature dependency set after a 10-day soak period, including Electron 44, Vitest 5, ESLint, Zod, and related type and build packages. Electron 44 raises the minimum macOS version to 13.
- Clarify unavailable-provider guidance and keep release instructions aligned with the current Mac, Linux, optional Windows, and Store workflows.

### Fixed

- Cancel and ignore in-flight import or upload results when a new LeagueSaga session link arrives.
- Report the current app version in ESPN requests and production smoke-test packages instead of stale hard-coded versions.

## [0.3.2] - 2026-09-15

### Added

- Fedora x64 RPM installer and Debian 12/13 package verification, including distro release gates.
- Linux x64 AppImage and Debian installers, independent Linux builds, and installed-package checks on Ubuntu.
- Linux assets and updater metadata checks in the desktop release publication gate.
- Automatic publication after release checks and the production preview smoke test pass for the same commit.

### Changed

- Clarify Cuellar Labs LLC's role as repository maintainer, official helper distributor, and LeagueSaga service operator.

### Fixed

- Identify the GitHub repository explicitly when staging release assets from a job without a checkout.

## [0.3.1] - 2026-09-15

First public release, with signed and notarized Mac installers for Apple Silicon and Intel.

### Added

- Desktop ESPN import flow with local sign-in, league selection, and discovery of linked historical seasons.
- Review of imported teams and owners, optional inclusion of rosters, matchups, draft picks, and transactions, and JSON export before upload.
- Validated, provider-neutral history packages using import contract version `0.3.0`.
- Launch links from LeagueSaga that prefill an import session and return users to the portal preview after upload.
- Settings for clearing the ESPN session, viewing privacy-safe diagnostic logs, and downloading signed app updates.
- Mac release automation for Apple Silicon and Intel, including signing, notarization, checksums, and installation checks on both architectures.

### Fixed

- Handling of legacy ESPN history and transaction imports.
- Mac updater metadata to use ZIP payloads whose checksums remain valid after installer notarization.

### Security

- Keep ESPN passwords and raw session cookies on the user's computer and restrict production uploads to the LeagueSaga portal.
- Harden packaged Electron builds with runtime protections and archive integrity checks.
- Update `js-yaml` to `4.3.2` to address a denial-of-service vulnerability.

[Unreleased]: https://github.com/dcuellar322/league-saga-import-helper/compare/v0.3.2...master
[0.3.2]: https://github.com/dcuellar322/league-saga-import-helper/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/dcuellar322/league-saga-import-helper/releases/tag/v0.3.1
