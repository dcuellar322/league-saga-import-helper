import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockHistoryImport } from '@leaguesaga/import-contract';

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  return {
    handlers,
    handle: vi.fn((channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    }),
    showSaveDialog: vi.fn(),
    getPath: vi.fn(() => '/tmp')
  };
});

const dependencies = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  clearEspnSession: vi.fn(async () => undefined),
  getEspnSessionStatus: vi.fn(async () => ({ isSignedIn: true, hasSwid: true, hasEspnS2: true })),
  closeEspnLoginWindow: vi.fn(),
  openEspnLoginWindow: vi.fn(async () => undefined),
  importEspnHistory: vi.fn(),
  exportDiagnostics: vi.fn(async () => undefined),
  recordDiagnostic: vi.fn(async () => undefined),
  openTrustedLeagueSagaUrl: vi.fn(),
  openTrustedProjectUrl: vi.fn(),
  openTrustedUpdateUrl: vi.fn(),
  readSettings: vi.fn(),
  saveSettings: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(async () => undefined),
  installUpdate: vi.fn(),
  uploadBundle: vi.fn()
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '0.3.0', getPath: electron.getPath, isPackaged: false },
  dialog: { showSaveDialog: electron.showSaveDialog },
  ipcMain: { handle: electron.handle }
}));
vi.mock('node:fs/promises', () => ({ mkdir: dependencies.mkdir, writeFile: dependencies.writeFile }));
vi.mock('./espn/cookies.js', () => ({
  clearEspnSession: dependencies.clearEspnSession,
  getEspnSessionStatus: dependencies.getEspnSessionStatus
}));
vi.mock('./espn/login-window.js', () => ({
  closeEspnLoginWindow: dependencies.closeEspnLoginWindow,
  openEspnLoginWindow: dependencies.openEspnLoginWindow
}));
vi.mock('./espn/history.js', () => ({
  importEspnHistory: dependencies.importEspnHistory,
  inclusiveSeasonRange: (start: number, end: number) =>
    Array.from({ length: end - start + 1 }, (_, index) => start + index)
}));
vi.mock('./diagnostics.js', () => ({
  exportDiagnostics: dependencies.exportDiagnostics,
  recordDiagnostic: dependencies.recordDiagnostic
}));
vi.mock('./security.js', () => ({
  openTrustedLeagueSagaUrl: dependencies.openTrustedLeagueSagaUrl,
  openTrustedProjectUrl: dependencies.openTrustedProjectUrl,
  openTrustedUpdateUrl: dependencies.openTrustedUpdateUrl
}));
vi.mock('./settings.js', () => ({ readSettings: dependencies.readSettings, saveSettings: dependencies.saveSettings }));
vi.mock('./updates.js', () => ({
  checkForUpdates: dependencies.checkForUpdates,
  downloadUpdate: dependencies.downloadUpdate,
  installUpdate: dependencies.installUpdate
}));
vi.mock('./upload.js', () => ({ uploadBundle: dependencies.uploadBundle }));

import { registerIpcHandlers } from './ipc-handlers.js';

const trustedEvent = {
  senderFrame: { url: 'app://bundle/index.html' },
  sender: { getURL: () => 'app://bundle/index.html' }
};

function invoke(channel: string, ...args: unknown[]): unknown {
  const handler = electron.handlers.get(channel);
  if (!handler) throw new Error(`Missing test IPC handler ${channel}.`);
  return handler(trustedEvent, ...args);
}

describe('IPC handler integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electron.handlers.clear();
    const history = createMockHistoryImport([2025]);
    dependencies.importEspnHistory.mockResolvedValue(history);
    dependencies.readSettings.mockResolvedValue({
      apiBaseUrl: 'http://localhost:15173',
      importToken: '',
      provider: 'espn',
      leagueId: ''
    });
    dependencies.saveSettings.mockImplementation(async (settings) => settings);
    dependencies.checkForUpdates.mockResolvedValue({ status: 'current', currentVersion: '0.3.0' });
    dependencies.uploadBundle.mockResolvedValue({
      ok: true,
      status: 200,
      code: 'ok',
      message: 'Uploaded.',
      retryable: false
    });
    registerIpcHandlers({
      isTrustedRendererUrl: (url) => url === 'app://bundle/index.html',
      onRendererReady: () => ({ leagueId: '424242', season: 2025 })
    });
  });

  it('registers and exercises the complete trusted renderer bridge', async () => {
    expect(electron.handlers.size).toBe(21);
    expect(invoke('app:version')).toBe('0.3.0');
    expect(invoke('app:runtime-config')).toEqual({ apiBaseUrl: 'http://localhost:15173', mockImportsEnabled: true });
    expect(invoke('app:renderer-ready')).toEqual({ leagueId: '424242', season: 2025 });
    await expect(invoke('settings:get')).resolves.toMatchObject({ provider: 'espn' });
    await expect(
      invoke('settings:save', {
        apiBaseUrl: 'http://localhost:15173',
        importToken: '',
        provider: 'espn',
        leagueId: '123456'
      })
    ).resolves.toMatchObject({ leagueId: '123456' });

    await expect(invoke('espn:open-login', { leagueId: '123456', season: 2025 })).resolves.toBeUndefined();
    await expect(invoke('espn:session-status')).resolves.toMatchObject({ isSignedIn: true });
    await expect(invoke('espn:clear-session')).resolves.toBeUndefined();
    expect(dependencies.closeEspnLoginWindow).toHaveBeenCalledOnce();
    expect(dependencies.clearEspnSession).toHaveBeenCalledOnce();

    await expect(
      invoke('espn:import', { leagueId: '123456', season: 2025, importSessionId: 'session-1' })
    ).resolves.toMatchObject({ history: { leagueExternalId: 'mock-league-history' } });
    expect(dependencies.importEspnHistory).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: '123456', startYear: 2025, importSessionId: 'session-1' }),
      expect.objectContaining({ helperVersion: '0.3.0', platform: process.platform })
    );
    expect(invoke('espn:cancel-import')).toBeUndefined();

    expect(invoke('mock:import', { leagueId: 'mock-league', season: 2025 })).toMatchObject({
      history: { provider: 'mock', startSeason: 2025 }
    });

    const history = createMockHistoryImport([2025]);
    electron.showSaveDialog.mockResolvedValueOnce({ canceled: true });
    await expect(invoke('bundle:save-to-disk', history)).resolves.toEqual({ canceled: true });
    electron.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/tmp/history.json' });
    await expect(invoke('bundle:save-to-disk', history)).resolves.toEqual({
      canceled: false,
      filePath: '/tmp/history.json'
    });
    expect(dependencies.writeFile).toHaveBeenCalledWith(
      '/tmp/history.json',
      expect.stringContaining('"league-history"'),
      'utf-8'
    );

    await expect(
      invoke('bundle:upload', {
        apiBaseUrl: 'http://localhost:15173',
        importToken: 'token',
        bundle: history
      })
    ).resolves.toMatchObject({ ok: true });
    expect(invoke('bundle:cancel-upload')).toBeUndefined();

    expect(invoke('app:open-leaguesaga-url', 'https://portal.leaguesaga.com/imports/1')).toBeUndefined();
    expect(invoke('app:open-update-url', 'https://github.com/releases/1')).toBeUndefined();
    expect(invoke('app:open-project-url', 'https://github.com/project/1')).toBeUndefined();
    await expect(invoke('app:check-for-updates')).resolves.toMatchObject({ status: 'current' });
    await expect(invoke('app:download-update')).resolves.toBeUndefined();
    expect(invoke('app:install-update')).toBeUndefined();

    electron.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/tmp/diagnostics.jsonl' });
    await expect(invoke('diagnostics:save')).resolves.toEqual({
      canceled: false,
      filePath: '/tmp/diagnostics.jsonl'
    });
    expect(dependencies.exportDiagnostics).toHaveBeenCalledWith('/tmp/diagnostics.jsonl');
  });

  it('rejects calls from an untrusted renderer', () => {
    const handler = electron.handlers.get('app:version')!;
    expect(() => handler({ senderFrame: { url: 'https://evil.example' }, sender: { getURL: () => '' } })).toThrow(
      'Rejected IPC call from an untrusted renderer.'
    );
  });
});
