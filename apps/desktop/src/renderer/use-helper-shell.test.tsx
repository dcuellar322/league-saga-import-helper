// @vitest-environment jsdom

import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HelperSettings, LeagueSagaBridge } from '../shared/ipc';
import { useHelperShell } from './use-helper-shell';

const settings: HelperSettings = {
  apiBaseUrl: 'http://localhost:15173',
  importToken: '',
  provider: 'espn',
  leagueId: ''
};

function createBridge(overrides: Partial<LeagueSagaBridge> = {}): LeagueSagaBridge {
  return {
    appVersion: vi.fn(async () => '0.3.0'),
    runtimeConfig: vi.fn(async () => ({ apiBaseUrl: settings.apiBaseUrl, mockImportsEnabled: true })),
    rendererReady: vi.fn(async () => null),
    getSettings: vi.fn(async () => settings),
    saveSettings: vi.fn(async (next) => next),
    openEspnLogin: vi.fn(async () => undefined),
    getEspnSessionStatus: vi.fn(async () => ({ isSignedIn: false, hasSwid: false, hasEspnS2: false })),
    clearEspnSession: vi.fn(async () => undefined),
    importFromEspn: vi.fn(),
    cancelEspnImport: vi.fn(async () => undefined),
    createMockImport: vi.fn(),
    saveBundleToDisk: vi.fn(async () => ({ canceled: true })),
    uploadBundle: vi.fn(),
    cancelUpload: vi.fn(async () => undefined),
    openLeagueSagaUrl: vi.fn(async () => undefined),
    openUpdateUrl: vi.fn(async () => undefined),
    openProjectUrl: vi.fn(async () => undefined),
    checkForUpdates: vi.fn(async () => ({
      status: 'available' as const,
      currentVersion: '0.3.0',
      latestVersion: '0.4.0',
      releaseUrl: 'https://github.com/example/release'
    })),
    downloadUpdate: vi.fn(async () => undefined),
    installUpdate: vi.fn(async () => undefined),
    saveDiagnostics: vi.fn(async () => ({ canceled: false, filePath: '/tmp/diagnostics.jsonl' })),
    onDeepLink: vi.fn(() => () => undefined),
    ...overrides
  };
}

function setBridge(bridge: LeagueSagaBridge): void {
  Object.defineProperty(window, 'leagueSaga', { configurable: true, value: bridge });
}

describe('useHelperShell', () => {
  beforeEach(() => setBridge(createBridge()));

  it('coordinates settings, updates, diagnostics, and project links', async () => {
    const bridge = createBridge();
    const showError = vi.fn();
    const setNotice = vi.fn();
    setBridge(bridge);
    const { result } = renderHook(() => useHelperShell({ showError, setNotice }));

    await waitFor(() => expect(result.current.version).toBe('0.3.0'));
    await waitFor(() => expect(result.current.updateInfo?.status).toBe('available'));
    act(() => result.current.setSettingsOpen(true));
    expect(result.current.settingsOpen).toBe(true);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(result.current.settingsOpen).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(result.current.settingsOpen).toBe(false);

    await act(async () => result.current.checkForUpdates());
    await act(async () => result.current.openReleaseNotes());
    expect(bridge.openUpdateUrl).toHaveBeenCalledWith('https://github.com/example/release');
    await act(async () => result.current.downloadAndInstallUpdate());
    expect(bridge.downloadUpdate).toHaveBeenCalledOnce();
    expect(bridge.installUpdate).toHaveBeenCalledOnce();
    expect(result.current.updateBusy).toBe('downloading');

    await act(async () => result.current.saveDiagnostics());
    expect(setNotice).toHaveBeenCalledWith(expect.objectContaining({ title: 'Diagnostics saved' }));
    await act(async () => result.current.openProjectDocument('https://github.com/example/project'));
    expect(bridge.openProjectUrl).toHaveBeenCalledWith('https://github.com/example/project');
    expect(showError).not.toHaveBeenCalled();
  });

  it('does not announce a canceled diagnostics export or open absent release notes', async () => {
    const bridge = createBridge({
      checkForUpdates: vi.fn(async () => ({ status: 'current' as const, currentVersion: '0.3.0' })),
      saveDiagnostics: vi.fn(async () => ({ canceled: true }))
    });
    const setNotice = vi.fn();
    setBridge(bridge);
    const { result } = renderHook(() => useHelperShell({ showError: vi.fn(), setNotice }));
    await waitFor(() => expect(result.current.updateInfo?.status).toBe('current'));

    await act(async () => result.current.openReleaseNotes());
    await act(async () => result.current.saveDiagnostics());
    expect(bridge.openUpdateUrl).not.toHaveBeenCalled();
    expect(setNotice).not.toHaveBeenCalled();
  });

  it('reports initialization and command errors and releases busy state', async () => {
    const failure = new Error('Bridge failed.');
    const checkForUpdates = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'available' as const,
        currentVersion: '0.3.0',
        latestVersion: '0.4.0',
        releaseUrl: 'https://github.com/example/release'
      })
      .mockRejectedValue(failure);
    const bridge = createBridge({
      appVersion: vi.fn(async () => {
        throw failure;
      }),
      checkForUpdates,
      downloadUpdate: vi.fn(async () => {
        throw failure;
      }),
      openUpdateUrl: vi.fn(async () => {
        throw failure;
      }),
      saveDiagnostics: vi.fn(async () => {
        throw failure;
      }),
      openProjectUrl: vi.fn(async () => {
        throw failure;
      })
    });
    const showError = vi.fn();
    setBridge(bridge);
    const { result } = renderHook(() => useHelperShell({ showError, setNotice: vi.fn() }));
    await waitFor(() => expect(result.current.updateInfo?.status).toBe('available'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith(failure));

    await act(async () => result.current.checkForUpdates());
    expect(result.current.updateBusy).toBeNull();
    await act(async () => result.current.downloadAndInstallUpdate());
    expect(result.current.updateBusy).toBeNull();
    await act(async () => result.current.openReleaseNotes());
    await act(async () => result.current.saveDiagnostics());
    await act(async () => result.current.openProjectDocument('https://github.com/example/project'));
    expect(showError.mock.calls.length).toBeGreaterThanOrEqual(6);
  });
});
