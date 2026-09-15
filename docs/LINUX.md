# Linux installation

Cuellar Labs LLC distributes Linux x64 packages through the
[official releases](https://github.com/dcuellar322/league-saga-import-helper/releases).
Choose an Intel or AMD 64-bit computer. Linux ARM64 is not included in this release configuration.

## Ubuntu 22.04/24.04 and Debian 12/13: Debian installer

Download the `.deb` from the release page or LeagueSaga's import screen. Open it with your system's
package installer, or install the downloaded file from a terminal:

```bash
sudo apt install ./LeagueSagaImportHelper-<version>-linux-amd64.deb
```

Replace `<version>` with the downloaded version. Launch **LeagueSaga Import Helper** from the
application menu once, then choose **Open Import Helper** in the LeagueSaga portal. The installed
desktop entry registers the `leaguesaga-import://` link handler.

## Fedora 44: RPM installer

Download the `.rpm` and open it with Software, or install it from a terminal:

```bash
sudo dnf install ./LeagueSagaImportHelper-<version>-linux-x86_64.rpm
```

Launch the helper from the application menu once, then choose **Open Import Helper** in the portal.
The RPM installs the same desktop protocol handler as the Debian package.

## AppImage alternative

On Ubuntu 22.04, Debian 12/13, or Fedora 44, download the AppImage, allow it to run as a program in
the file's properties, and open it. Keep it in a permanent folder. AppImages require FUSE on some systems; when FUSE is unavailable, run:

```bash
chmod +x ./LeagueSagaImportHelper-<version>-linux-x86_64.AppImage
./LeagueSagaImportHelper-<version>-linux-x86_64.AppImage --appimage-extract-and-run
```

A portable AppImage does not guarantee application-menu or browser-link integration. Use your
distribution's `.deb` or `.rpm` for the portal's **Open Import Helper** flow. Use the `.deb` on Ubuntu 24.04, where restrictions on
unprivileged user namespaces can prevent an uninstalled AppImage from starting. Do not work around
startup errors by disabling the Electron sandbox or weakening system security settings.

## Updates and verification

Settings downloads updates through the official GitHub release channel. Debian and RPM updates can
request administrator authentication; AppImage updates require a writable AppImage file. Install the newer
package manually from the official release page if an update cannot complete.

Linux packages do not use Apple's Developer ID signing or notarization. Release checks verify the
installer payloads and updater hashes, and the release page includes `SHA256SUMS.txt`. To check a
single downloaded package, compare its output with that file:

```bash
sha256sum ./LeagueSagaImportHelper-<version>-linux-amd64.deb
```

The automated checks cover Ubuntu 22.04/24.04, Debian 12/13, and Fedora 44 on x64. Other
distributions (including Mint, openSUSE, Arch, and RHEL derivatives) may work with these formats,
but are not currently covered by the release checks. No native Arch, Flatpak, or Snap package
is published. Live ESPN sign-in, production preview delivery, session clearing, and local updates have
also been exercised; see the [verification report](LINUX_VERIFICATION.md) for evidence and remaining checks.
Updates between published GitHub versions and interactive desktop administrator prompts still need
release verification.
