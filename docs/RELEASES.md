# Release Guide

## Local package

```bash
npm install
npm run test:coverage
npm run typecheck
npm run make
```

Artifacts will be generated under `apps/desktop/dist/`.

The GitHub release must include Electron Builder's `latest*.yml` update metadata and any generated
`.blockmap` files alongside the installers. The in-app Settings updater depends on those files to
select, verify, download, and install the correct signed artifact.

Before non-technical beta users receive builds, macOS and Windows artifacts must be signed,
macOS artifacts must be notarized, and each GitHub release must include SHA-256 checksums.
Treat missing signing/notarization or missing checksums as release blockers for beta and public
distribution.

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

Unsigned builds are acceptable for local development. The tag release workflow deliberately fails if signing or notarization secrets are absent.

## Checksums

After building:

```bash
find apps/desktop/dist -maxdepth 5 -type f -print0 | xargs -0 shasum -a 256 > SHA256SUMS.txt
```

The release workflow combines all native artifacts, generates `SHA256SUMS.txt`, and creates the GitHub Release. It also checks that the tag, root package, desktop package, contract package, and source contract versions match.

## Suggested release naming

```text
LeagueSaga Import Helper v0.3.0

Assets:
- LeagueSagaImportHelper-0.3.0-mac-arm64.dmg
- LeagueSagaImportHelper-0.3.0-mac-x64.dmg
- LeagueSagaImportHelper-0.3.0-win-x64.exe
- LeagueSagaImportHelper-0.3.0-linux-x64.AppImage, .deb, or .zip
- latest.yml, latest-mac.yml, and latest-linux.yml
- generated installer and zip .blockmap files
- SHA256SUMS.txt
```

## Release verification

Before announcing a release:

1. Install each native artifact on a clean supported OS.
2. Launch with a `leaguesaga-import://start` link containing the canonical portal
   API base and confirm league, season, session ID, and token handoff.
3. Complete a sanitized end-to-end preview against the production API.
4. Verify macOS notarization with `xcrun stapler validate` and Windows signatures with `Get-AuthenticodeSignature`.
5. Confirm the packaged fuse report disables Node injection/inspection and enforces encrypted cookies and ASAR integrity.
6. From the prior packaged version, use Settings to download the new release and confirm the app restarts on the new version.

The manually dispatched **Production upload smoke test** workflow requires approval through the `production-smoke` GitHub environment plus a newly issued one-time `LEAGUESAGA_SMOKE_TOKEN` and `LEAGUESAGA_SMOKE_SESSION_ID`. It uploads a sanitized minimal ESPN-shaped bundle, prints only the HTTP status, and rejects continuation URLs outside LeagueSaga. Run it before promoting a public release; the preview it creates can then be deleted through the normal LeagueSaga flow.

The production API and continuation origin is `https://portal.leaguesaga.com`. A release is
blocked if a packaged deep link, upload, or continuation targets the marketing hostname, apex
hostname, localhost, or an unrelated origin.
