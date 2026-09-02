import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const electronApp = vi.hoisted(() => ({
  isPackaged: false,
  getPath: vi.fn(() => '')
}));
vi.mock('electron', () => ({ app: electronApp }));

import { readSettings, saveSettings } from './settings.js';

let userData = '';

describe('helper settings persistence', () => {
  beforeEach(async () => {
    userData = await mkdtemp(join(tmpdir(), 'leaguesaga-settings-'));
    electronApp.isPackaged = false;
    electronApp.getPath.mockReturnValue(userData);
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(userData, { recursive: true, force: true });
  });

  it('returns safe development defaults when no settings file exists', async () => {
    await expect(readSettings()).resolves.toEqual({
      apiBaseUrl: 'http://localhost:15173',
      importToken: '',
      importSessionId: undefined,
      leagueId: ''
    });
  });

  it('persists only nonsecret league details with owner-only permissions', async () => {
    const saved = await saveSettings({
      apiBaseUrl: 'http://localhost:15173/',
      importToken: 'one-time-secret',
      importSessionId: 'session-secret',
      leagueId: ' 12345 ',
      season: 2025
    });
    expect(saved).toMatchObject({ leagueId: '12345', importToken: 'one-time-secret', season: 2025 });

    const path = join(userData, 'settings.json');
    expect(JSON.parse(await readFile(path, 'utf-8'))).toEqual({ leagueId: '12345', season: 2025 });
    expect((await stat(path)).mode & 0o777).toBe(0o600);

    await expect(readSettings()).resolves.toMatchObject({
      apiBaseUrl: 'http://localhost:15173',
      importToken: '',
      leagueId: '12345',
      season: 2025
    });
  });

  it('recovers from corrupt files and honors explicit development environment values', async () => {
    await writeFile(join(userData, 'settings.json'), '{not-json', 'utf-8');
    vi.stubEnv('LEAGUESAGA_API_BASE', 'http://127.0.0.1:15173/api');
    vi.stubEnv('LEAGUESAGA_IMPORT_TOKEN', 'environment-token');

    await expect(readSettings()).resolves.toMatchObject({
      apiBaseUrl: 'http://127.0.0.1:15173/api',
      importToken: 'environment-token',
      leagueId: ''
    });
  });
});
