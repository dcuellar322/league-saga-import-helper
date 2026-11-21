# LeagueSaga Import Helper v0.3.4

Draft release notes for the next helper release. Complete the publication checks below before
announcing downloads. Follow [the release guide](RELEASES.md) for the signed build and preview steps.

## Changes since v0.3.2

### Added

- Microsoft Store submission packages and optional signed bundles for testing in a disposable Windows VM.
  Store availability depends on Microsoft certification; these packages do not establish a public listing.

### Changed

- Update Electron to 45.3.0, with embedded Node 24.22.2, and refresh the runtime and build dependencies
  after the 10-day soak period. The update includes React 19.3.1 and Zod 4.6.7.
- Require macOS 13 or newer.
- Let Microsoft Store installations use Store-managed updates.
- Clarify which providers are available and align installation guidance with the supported platforms.

### Fixed

- Cancel and ignore in-flight import or upload results when a new LeagueSaga session link arrives.
- Report the current helper version in ESPN requests and production smoke-test packages.

### Security

- Include the CVE-2026-111497 Brotli decoder fix in Electron's embedded Node runtime. Installed
  copies receive the fix only after upgrading to this helper release.
- Require patched host Node versions for development and CI, and update Zod to pass the production
  dependency audit.

## Compatibility and distribution

- Import contract version remains **0.3.0**; the history package format is unchanged.
- Desktop release targets are macOS Intel, macOS Apple Silicon, and Linux x64. Windows Store
  submission packages use the separate Store workflow. Direct Windows installers require signing
  credentials and an explicit `platforms=all` release build.
- Microsoft Store package version is **1.3.4.0**, derived from app version **0.3.4**.
- Electron remains pinned to **45.3.0**. It does not include the later November 11 Node security
  update; see the [runtime status in the README](../README.md#requirements).

## Publication checks

Keep the changelog entries under `Unreleased` until this version is published. Then move them to
`0.3.4` with the actual publication date and update the comparison links. Use the changes and
compatibility sections above in the GitHub release body; keep the draft status and this checklist
out of the published notes.

- [ ] Merge the release preparation and create `v0.3.4` at the intended release commit.
- [ ] Pass the tagged Release workflow, including signing, notarization, both Mac architecture
      launch checks, and Linux package verification on the configured distributions.
- [ ] Verify SHA-256 checksums and updater metadata for every staged artifact.
- [ ] Run the approved synthetic production-preview smoke test with a fresh one-time session
      against the same commit as the tagged build.
- [ ] Verify an update from the prior installed helper through Settings.
- [ ] Confirm the publication gates pass, publish the verified draft, and record the actual
      publication date in the changelog.
