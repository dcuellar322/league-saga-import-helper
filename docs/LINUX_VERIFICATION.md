# Linux verification

## September 15, 2026

### Packaged application

- Built the Linux x64 AppImage, Debian installer, and RPM installer from the working tree.
- Installed and launched the Debian package in isolated Ubuntu 22.04 and 24.04 containers.
- Installed and launched the Debian package on Debian 12 and 13, and the RPM on Fedora 44,
  in isolated x64 containers. Confirmed each installed package selects its matching updater type.
- Launched the AppImage on Ubuntu 22.04, Debian 12/13, and Fedora 44 with extraction enabled
  instead of FUSE.
- Checked desktop entry validation, protocol registration, synthetic deep-link delivery to the
  packaged renderer, and SHA-512/size consistency for all three updater payloads.
- The added Debian 12/13 and Fedora 44 checks used the same container bootstrap and verification
  scripts now required by the release workflow. All three completed successfully.
- Kept Electron's sandbox enabled. Docker supplied namespace capabilities for the test containers;
  these checks do not reproduce every host desktop's security policy or display environment.

### Local update exercise

Both Debian and AppImage updates passed:

1. Start the older packaged app as a regular user.
2. Save synthetic league settings.
3. Discover and download the newer package through the helper's update functions.
4. Invoke installation and restart through the helper's update functions.
5. Confirm the running app reports the newer version and retains the saved settings.

The exercise used unpublished `0.3.1` and `0.3.2` test copies, a generic HTTP update server on an
isolated Docker network, and temporary instrumentation to invoke the existing update functions and
record assertions. Only the test copies changed their update lookup and feed destinations. Production
source continues to use GitHub. Debian installation used the updater's sudo path with a passwordless
test user; an interactive desktop authorization prompt still needs separate verification.

These results prove the local download/install/restart path for both formats. They do not prove
GitHub release delivery, a public-version upgrade, or the Settings button interactions themselves.
The test packages must not be published as official releases.

### Live ESPN and LeagueSaga preview

- The user signed in directly to ESPN in the unmodified Linux Debian helper.
- The helper detected both required ESPN session indicators and retrieved a multi-season private
  league history. Provider coverage notes remained visible in the review.
- A fresh one-time portal session reached the already-running helper through its launch URL without
  losing the ESPN sign-in. A subsequent import included that session identifier.
- The helper uploaded the reviewed package successfully. The production portal showed the received
  preview with matching season and record totals. The import was not committed to the league.
- Clear local ESPN session returned the helper to Waiting for sign-in, with neither ESPN credential
  indicator detected.
- The temporary live desktop and update-test containers were removed after verification. No provider
  credentials, raw league payloads, or one-time launch links were written to this repository.

### Remaining release verification

- Verify delivery and updates between two published Linux releases through GitHub.
- Verify Debian's interactive administrator prompt on a normal Linux desktop.
- Exercise an RPM version-to-version update, including its desktop administrator prompt.
  The Fedora checks above verify installation, launch, and updater selection, not an upgrade.
