# LeagueSaga assets

These files come from the canonical brand kit in the `league-saga` repository:

- `league-saga-app-icon.png` is the 1024 px app-store icon. Electron Builder uses it to derive native application icons.
- `league-saga-mark.png` is the full-color transparent mark used in the application header.
- `league-saga-wordmark-reverse.svg` is the two-tone wordmark used beside the mark on dark surfaces.
- `league-saga-mark-one-color-navy.svg` is the scalable one-color mark for future branded output.

Electron Builder creates these platform-specific application icons:

- `icon.icns` for macOS
- `icon.ico` for Windows
- `icon.png` for Linux

The release workflow builds each platform natively and fails if an installer is not produced.
