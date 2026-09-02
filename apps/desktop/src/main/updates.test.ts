import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronApp = vi.hoisted(() => ({ isPackaged: true, getVersion: () => '0.2.0' }));
vi.mock('electron', () => ({ app: electronApp }));

const updater = vi.hoisted(() => ({
  autoDownload: true,
  autoInstallOnAppQuit: false,
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn()
}));
vi.mock('electron-updater', () => ({ default: { autoUpdater: updater } }));

import { checkForUpdates, downloadUpdate, installUpdate } from './updates.js';

describe('release update checks', () => {
  beforeEach(() => {
    electronApp.isPackaged = true;
    updater.checkForUpdates.mockReset();
    updater.downloadUpdate.mockReset();
    updater.quitAndInstall.mockReset();
    vi.restoreAllMocks();
  });

  it('reports newer trusted GitHub releases', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            tag_name: 'v0.3.0',
            html_url: 'https://github.com/dcuellar322/league-saga-import-helper/releases/tag/v0.3.0'
          }),
          { status: 200 }
        )
      )
    );
    await expect(checkForUpdates()).resolves.toMatchObject({
      status: 'available',
      currentVersion: '0.2.0',
      latestVersion: '0.3.0'
    });
  });

  it('rejects untrusted release responses and skips checks in development', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ tag_name: 'v9.0.0', html_url: 'https://evil.example/release' }), {
          status: 200
        })
      )
    );
    await expect(checkForUpdates()).resolves.toMatchObject({ status: 'unavailable' });
    electronApp.isPackaged = false;
    await expect(checkForUpdates()).resolves.toEqual({ status: 'current', currentVersion: '0.2.0' });
  });

  it('downloads a newer signed update through the packaged updater', async () => {
    updater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '0.3.0' } });
    updater.downloadUpdate.mockResolvedValue(['/tmp/LeagueSagaImportHelper']);

    await expect(downloadUpdate()).resolves.toBeUndefined();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.downloadUpdate).toHaveBeenCalledOnce();
  });

  it('refuses updater actions without a newer packaged release', async () => {
    updater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '0.2.0' } });
    await expect(downloadUpdate()).rejects.toThrow('No newer signed release');

    electronApp.isPackaged = false;
    await expect(downloadUpdate()).rejects.toThrow('packaged app');
    expect(() => installUpdate()).toThrow('packaged app');
  });

  it('restarts through the updater after an update is downloaded', async () => {
    installUpdate();
    await new Promise((resolve) => setImmediate(resolve));
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
});
