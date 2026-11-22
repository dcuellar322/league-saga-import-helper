# LeagueSaga Import Helper v0.3.4

Published on November 22, 2026. See the [public release](https://github.com/dcuellar322/league-saga-import-helper/releases/tag/v0.3.4)
and follow [the release guide](RELEASES.md) for the build and preview procedures.

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

## Verification

- [Tagged release build](https://github.com/dcuellar322/league-saga-import-helper/actions/runs/44875119625):
  signing, notarization, both Mac architecture launch checks, and Linux package verification passed.
- [Prior-version update checks](https://github.com/dcuellar322/league-saga-import-helper/actions/runs/45068735251):
  both Mac architectures upgraded through Settings from an isolated v0.3.2 test copy, restarted into
  the unchanged signed v0.3.4 payload, and retained settings. The test copies used a local feed and
  UI instrumentation and were re-signed with the same Developer ID; public GitHub discovery was
  checked separately after publication.
- The delivered `latest-mac.yml` includes `minimumSystemVersion: 22.0.0` (Darwin 22, macOS 13).
  The prior updater rejected a simulated macOS 12 host. This delivery metadata and its checksum
  were updated in the draft after the tagged build; signed payloads and the tag were unchanged.
- [Production preview](https://github.com/dcuellar322/league-saga-import-helper/actions/runs/45069456485):
  HTTP 200 at release commit `93334c7470225a6f0873f7ca907eed2babf2e6cf`. The portal displayed the
  synthetic preview; no league history was saved.
- [Publication gate](https://github.com/dcuellar322/league-saga-import-helper/actions/runs/45065819489):
  matching tag, preview evidence, and all asset checksums passed before publication.
