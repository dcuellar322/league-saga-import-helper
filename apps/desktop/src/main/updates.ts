import { app } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateInfo } from '../shared/ipc.js';

const LATEST_RELEASE_URL = 'https://api.github.com/repos/dcuellar322/league-saga-import-helper/releases/latest';

export async function checkForUpdates(): Promise<UpdateInfo> {
  if (!app.isPackaged) return { status: 'current', currentVersion: app.getVersion() };
  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': `LeagueSaga-Import-Helper/${app.getVersion()}` },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) return { status: 'unavailable', currentVersion: app.getVersion() };
    const body = (await response.json()) as { tag_name?: unknown; html_url?: unknown };
    const latestVersion = typeof body.tag_name === 'string' ? body.tag_name.replace(/^v/, '') : undefined;
    const releaseUrl =
      typeof body.html_url === 'string' &&
      body.html_url.startsWith('https://github.com/dcuellar322/league-saga-import-helper/releases/')
        ? body.html_url
        : undefined;
    if (!latestVersion || !releaseUrl) return { status: 'unavailable', currentVersion: app.getVersion() };
    return {
      status: compareVersions(latestVersion, app.getVersion()) > 0 ? 'available' : 'current',
      currentVersion: app.getVersion(),
      latestVersion,
      releaseUrl
    };
  } catch {
    return { status: 'unavailable', currentVersion: app.getVersion() };
  }
}

export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged) throw new Error('Updates can only be installed from a packaged app.');

  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const result = await autoUpdater.checkForUpdates();
  const latestVersion = result?.updateInfo.version;
  if (!latestVersion || compareVersions(latestVersion, app.getVersion()) <= 0) {
    throw new Error('No newer release is available to download.');
  }
  await autoUpdater.downloadUpdate();
}

export function installUpdate(): void {
  if (!app.isPackaged) throw new Error('Updates can only be installed from a packaged app.');
  setImmediate(() => electronUpdater.autoUpdater.quitAndInstall(false, true));
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
