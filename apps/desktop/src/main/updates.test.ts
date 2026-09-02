import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronApp = vi.hoisted(() => ({ isPackaged: true, getVersion: () => '0.1.0' }));
vi.mock('electron', () => ({ app: electronApp }));

import { checkForUpdates } from './updates.js';

describe('release update checks', () => {
  beforeEach(() => {
    electronApp.isPackaged = true;
    vi.restoreAllMocks();
  });

  it('reports newer trusted GitHub releases', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            tag_name: 'v0.2.0',
            html_url: 'https://github.com/dcuellar322/league-saga-import-helper/releases/tag/v0.2.0'
          }),
          { status: 200 }
        )
      )
    );
    await expect(checkForUpdates()).resolves.toMatchObject({
      status: 'available',
      currentVersion: '0.1.0',
      latestVersion: '0.2.0'
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
    await expect(checkForUpdates()).resolves.toEqual({ status: 'current', currentVersion: '0.1.0' });
  });
});
