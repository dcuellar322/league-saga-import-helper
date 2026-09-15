# Release Guide

## Maintaining the changelog

Record notable user-facing changes in [CHANGELOG.md](../CHANGELOG.md) under `Unreleased`
as part of each change. Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/):
use `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, or `Security` sections as needed,
omit empty categories, and describe the impact rather than copying commit messages.

When a release is published, move its entries into a `## [X.Y.Z] - YYYY-MM-DD` section,
using the app version and actual publication date. Keep the newest release first and retain
`Unreleased` at the top. A build tag or draft alone does not count as a published release.

Update the reference links at the bottom: `Unreleased` should compare the latest released tag
with `master`, and each subsequent release should compare its tag with the previous released tag.
For the first release, link its heading to the GitHub release page. Before any public release,
the `Unreleased` link points to the repository history.

Use the curated version section in the public release notes. The release workflow currently
generates GitHub notes from commits; review those notes against the changelog when publishing.

The repository's [.github/CODEOWNERS](../.github/CODEOWNERS) assigns review ownership to
`@dcuellar322`. Requiring a code-owner approval before merging is a separate GitHub branch
protection or ruleset setting.

## Local package

```bash
npm ci
npm run test:coverage
npm run typecheck
npm run make
```

Artifacts will be generated under `apps/desktop/dist/`.

The GitHub release must include Electron Builder's `latest*.yml` update metadata and any generated
`.blockmap` files alongside the installers. The in-app Settings updater depends on those files to
select, verify, download, and install the correct signed artifact.

Before non-technical beta users receive builds, any macOS and Windows artifacts must be signed,
macOS artifacts must be notarized, and each GitHub release must include SHA-256 checksums.
Treat missing signing/notarization or missing checksums as release blockers for beta and public
distribution.

## Dependency maintenance

Use a 10-day soak period for direct npm dependencies. For each outdated dependency, choose the
newest stable release published at least 10 full days ago. Do not select a newer unsoaked release
only because it carries the `latest` tag. Update the direct dependency ranges and `package-lock.json`
together, review major-version release notes, then run `npm audit --omit=dev`, `npm run quality`, and
`npm run package`. Record the update under `Unreleased` in the changelog.

## macOS signing and notarization

Set these GitHub Actions secrets:

```bash
MACOS_CSC_LINK=
MACOS_CSC_KEY_PASSWORD=
APPLE_API_KEY_BASE64=
APPLE_API_KEY_ID=
APPLE_API_ISSUER=
```

`MACOS_CSC_LINK` should contain a base64-encoded Developer ID Application certificate or secure file URL supported by Electron Builder. The release job maps it to `CSC_LINK`. `APPLE_API_KEY_BASE64` is the base64-encoded contents of the App Store Connect `.p8` private key; the workflow materializes it as a permission-restricted temporary file for notarization.

## Windows signing

Set these secrets:

```bash
WINDOWS_CSC_LINK=
WINDOWS_CSC_KEY_PASSWORD=
```

Unsigned builds are acceptable for local development. Release jobs fail when a selected platform
requires signing or notarization credentials and those credentials are absent. The normal tag flow
builds macOS and Linux; Windows runs only when `platforms=all` is selected manually.

## Checksums

After building:

```bash
find apps/desktop/dist -maxdepth 5 -type f -print0 | xargs -0 shasum -a 256 > SHA256SUMS.txt
```

The release workflow combines all native artifacts, generates `SHA256SUMS.txt`, and creates the GitHub Release. It checks that the tag, root package, and desktop package versions match, and separately checks
that the contract package matches its source version. App-only patch releases preserve the import contract.

## Suggested release naming

```text
LeagueSaga Import Helper vX.Y.Z

Assets:
- LeagueSagaImportHelper-X.Y.Z-mac-arm64.dmg
- LeagueSagaImportHelper-X.Y.Z-mac-x64.dmg
- LeagueSagaImportHelper-X.Y.Z-win-x64.exe (when Windows is selected)
- LeagueSagaImportHelper-X.Y.Z-linux-x86_64.AppImage
- LeagueSagaImportHelper-X.Y.Z-linux-amd64.deb
- LeagueSagaImportHelper-X.Y.Z-linux-x86_64.rpm
- latest.yml, latest-mac.yml, and latest-linux.yml
- generated installer and zip .blockmap files
- SHA256SUMS.txt
```

## Release verification

Before announcing a release:

1. Install each native artifact on a clean supported OS.
2. Launch with a `leaguesaga-import://start` link containing the canonical portal
   API base and confirm league, start season, session ID, and token-presence handoff. The packaged
   smoke test performs these assertions on every release platform.
3. Complete a sanitized end-to-end preview against the production API.
4. Verify macOS notarization with `xcrun stapler validate` and Windows signatures with `Get-AuthenticodeSignature`.
5. Confirm the packaged fuse report disables Node injection/inspection and enforces encrypted cookies and ASAR integrity.
6. From the prior packaged version, use Settings to download the new release and confirm the app restarts on the new version.

The manually dispatched **Production upload smoke test** workflow requires approval through the `production-smoke` GitHub environment plus a newly issued one-time `LEAGUESAGA_SMOKE_TOKEN` and `LEAGUESAGA_SMOKE_SESSION_ID`. It uploads a sanitized minimal ESPN-shaped bundle, prints only the HTTP status, and rejects continuation URLs outside LeagueSaga. Run it before promoting a public release; the preview it creates can then be deleted through the normal LeagueSaga flow.

The production API and continuation origin is `https://portal.leaguesaga.com`. A release is
blocked if a packaged deep link, upload, or continuation targets the marketing hostname, apex
hostname, localhost, or an unrelated origin.

## GitHub release pipeline

Tag pushes build macOS and Linux. To include Windows, dispatch Release with `platforms=all`;
select a version tag to stage a release, or a branch to build artifacts only.
Windows still requires its own signing credentials.

The Mac job builds both architectures with signing required and automatic publishing disabled.
It validates app signatures and stapled notarization tickets, then signs, notarizes, and staples
the DMGs. DMGs are excluded from updater metadata because stapling changes their bytes after
Electron Builder generates metadata. The updater uses the notarized ZIPs instead.
Fresh Apple Silicon and Intel runners install the DMG contents, extract the updater ZIPs, verify
Developer ID signatures, hardened runtime, notarization and Gatekeeper acceptance, and run the
packaged production deep-link smoke test using the executable named in Info.plist.

Successful tagged builds create a draft GitHub Release with SHA-256 checksums. Before publishing,
run the production preview smoke test, review its result, and complete the prior-version update
test described above.

For the production smoke test, create a fresh ESPN Import Helper session in the portal for league
ID **424242**, with no starting year. Copy the Open Import Helper link and save its `token` and
`importSessionId` values as `LEAGUESAGA_SMOKE_TOKEN` and `LEAGUESAGA_SMOKE_SESSION_ID` in the
`production-smoke` GitHub environment. Never paste the link or token into logs, issues or chat.
Dispatch Production upload smoke test against the release tag before the session expires. The
script uploads synthetic data for that exact league ID; it does not commit an import.
After all checks pass, publish the draft release. The portal's existing macOS link points to
GitHub's latest release page.

The **Publish verified desktop release** workflow promotes a successful tagged Release automatically
only when the production smoke workflow has also succeeded for the same commit. It checks the tag
still resolves to that commit, downloads the draft assets, verifies their SHA-256 checksums, and
requires both architecture installers and ZIP entries in the updater metadata before publishing.
Run the production smoke test while Release is waiting for notarization so that its evidence is
available when Release completes. If that evidence is missing, the release remains a draft.
The **Notarization status** workflow can read Apple's submission history without resubmitting apps.

### Recovering a publication failure

If signing, notarization, and native verification succeeded but the final GitHub release step failed,
reuse the artifacts from that exact run. Do not rebuild or move the version tag. Confirm the tag
still points to the run's commit and the production preview succeeded for the same commit. Require
all platform checks configured in that tagged workflow; newer platforms added on master do not change
an older tag's release scope.

Download the original run's artifacts, verify updater payload hashes and sizes, generate
`SHA256SUMS.txt`, and stage a draft. Verify the uploaded asset sizes and SHA-256 digests against
the local files before publishing; download the draft again if uploaded digests are unavailable. Keep links to the original build and preview evidence in the release notes. GitHub CLI
steps without a checkout must set `GH_REPO` (or pass `--repo`) explicitly. A failed historical run
will retain its failure status after manual recovery.

## Linux releases

Linux x64 builds produce an AppImage, a `.deb`, and an `.rpm`; no ZIP is published because it does not provide
installation or desktop integration. Build on Ubuntu 22.04 to preserve the supported baseline.
`verify-linux` installs the `.deb` on Ubuntu 22.04 and 24.04, validates the desktop protocol entry,
launches that entry with synthetic import details, and checks every updater payload's size and
SHA-512. Ubuntu 22.04 also runs the AppImage with extraction instead of requiring FUSE.
No check disables Electron's sandbox. See [Linux installation](LINUX.md).

Manual `platforms=linux` runs independently of Apple and Windows signing. `desktop` builds Mac and
Linux; `macos` builds only Mac; `all` includes Windows. A branch run produces Actions artifacts;
a tag run stages a draft. Automatic publication is limited to tag pushes and requires successful
Mac and Linux verification, matching production-preview evidence, and all three Linux packages in
`latest-linux.yml`, in addition to the existing Mac assets and checksums.

Before announcing Linux support, test ESPN sign-in, review, upload, clearing the session, and browser
launch links on a Linux desktop, both with the helper closed and already open. Test Settings updates
from an older installed version for both package formats. The CI smoke tests use synthetic launch
parameters and do not authenticate to ESPN or prove an upgrade between two published versions.

The `verify-linux-distros` job also installs and launches the packages in Debian 12, Debian 13,
and Fedora 44 containers. It checks native package architecture, the installed updater package type,
desktop URL registration, the packaged renderer, AppImage startup, and updater hashes. Release
publication requires these jobs to pass. Containers use namespace capabilities for Electron's
sandbox; they do not disable the app sandbox or represent every host security policy. Distribution
versions in the matrix are explicit and should be reviewed when a supported release reaches end of life.

## Microsoft Store (free Windows distribution)

Use the separate **Windows Store package** workflow for unsigned MSIX submission packages.
Microsoft handles signing and updates after certification. The existing signed NSIS workflow is
for direct distribution and still requires its signing credentials. Store artifacts are not attached
to the public desktop GitHub release. See [Microsoft Store setup and verification](WINDOWS_STORE.md).
