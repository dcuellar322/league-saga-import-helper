// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { createMockHistoryImport } from '@leaguesaga/import-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeepLinkSettings, HelperSettings, LeagueSagaBridge } from '../shared/ipc';
import { useImportWorkflow } from './use-import-workflow';

const settings: HelperSettings = {
  apiBaseUrl: 'http://localhost:15173',
  importToken: '',
  provider: 'espn',
  leagueId: '424242',
  season: 2025
};

function createBridge(overrides: Partial<LeagueSagaBridge> = {}): LeagueSagaBridge {
  const history = createMockHistoryImport([2025]);
  return {
    appVersion: vi.fn(async () => '0.3.0'),
    runtimeConfig: vi.fn(async () => ({ apiBaseUrl: settings.apiBaseUrl, mockImportsEnabled: true })),
    rendererReady: vi.fn(async () => null),
    getSettings: vi.fn(async () => settings),
    saveSettings: vi.fn(async (next) => next),
    openEspnLogin: vi.fn(async () => undefined),
    getEspnSessionStatus: vi.fn(async () => ({ isSignedIn: false, hasSwid: false, hasEspnS2: false })),
    clearEspnSession: vi.fn(async () => undefined),
    importFromEspn: vi.fn(async () => ({ history, warnings: [] })),
    cancelEspnImport: vi.fn(async () => undefined),
    createMockImport: vi.fn(async () => ({ history, warnings: [] })),
    saveBundleToDisk: vi.fn(async () => ({ canceled: false, filePath: '/tmp/history.json' })),
    uploadBundle: vi.fn(async () => ({
      ok: true,
      status: 200,
      code: 'ok' as const,
      message: 'Uploaded.',
      retryable: false,
      continuationUrl: 'https://portal.leaguesaga.com/imports/1'
    })),
    cancelUpload: vi.fn(async () => undefined),
    openLeagueSagaUrl: vi.fn(async () => undefined),
    openUpdateUrl: vi.fn(async () => undefined),
    openProjectUrl: vi.fn(async () => undefined),
    checkForUpdates: vi.fn(async () => ({ status: 'current' as const, currentVersion: '0.3.0' })),
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

describe('useImportWorkflow', () => {
  beforeEach(() => setBridge(createBridge()));
  afterEach(() => vi.useRealTimers());

  it('initializes, accepts later deep links, and unsubscribes on unmount', async () => {
    let receiveDeepLink: ((settings: DeepLinkSettings) => void) | undefined;
    const unsubscribe = vi.fn();
    const bridge = createBridge({
      onDeepLink: vi.fn((callback) => {
        receiveDeepLink = callback;
        return unsubscribe;
      })
    });
    setBridge(bridge);
    const { result, unmount } = renderHook(() => useImportWorkflow());

    await waitFor(() => expect(result.current.settings.leagueId).toBe('424242'));
    expect(result.current.runtimeConfig.mockImportsEnabled).toBe(true);
    act(() =>
      receiveDeepLink?.({
        apiBaseUrl: 'https://portal.leaguesaga.com',
        importToken: 'token',
        importSessionId: 'session',
        leagueId: '999'
      })
    );
    expect(result.current.settings).toMatchObject({
      apiBaseUrl: 'https://portal.leaguesaga.com',
      provider: 'espn',
      leagueId: '999',
      importToken: 'token',
      importSessionId: 'session'
    });
    expect(result.current.step).toBe('details');

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('cancels and ignores an import from the previous deep-link session', async () => {
    let receiveDeepLink: ((settings: DeepLinkSettings) => void) | undefined;
    let finishImport: ((value: Awaited<ReturnType<LeagueSagaBridge['importFromEspn']>>) => void) | undefined;
    const bridge = createBridge({
      onDeepLink: vi.fn((callback) => {
        receiveDeepLink = callback;
        return () => undefined;
      }),
      importFromEspn: vi.fn(
        () =>
          new Promise<Awaited<ReturnType<LeagueSagaBridge['importFromEspn']>>>((resolve) => {
            finishImport = resolve;
          })
      )
    });
    setBridge(bridge);
    const { result } = renderHook(() => useImportWorkflow());
    await waitFor(() => expect(result.current.settings.leagueId).toBe('424242'));

    act(() => void result.current.importEspn());
    await waitFor(() => expect(result.current.busyAction).toBe('importing'));
    act(() =>
      receiveDeepLink?.({
        apiBaseUrl: 'https://portal.leaguesaga.com',
        importToken: 'new-token',
        importSessionId: 'new-session',
        leagueId: '999'
      })
    );

    expect(bridge.cancelEspnImport).toHaveBeenCalledOnce();
    expect(result.current.busyAction).toBeNull();
    expect(result.current.history).toBeNull();
    await act(async () => finishImport?.({ history: createMockHistoryImport([2025]), warnings: [] }));
    expect(result.current.history).toBeNull();
    expect(result.current.step).toBe('details');
    expect(result.current.settings).toMatchObject({
      leagueId: '999',
      importToken: 'new-token',
      importSessionId: 'new-session'
    });
  });

  it('reports initialization and command failures without leaving the workflow busy', async () => {
    const bridge = createBridge({
      runtimeConfig: vi.fn(async () => {
        throw new Error('Runtime configuration failed.');
      }),
      createMockImport: vi.fn(async () => {
        throw new Error('Mock import failed.');
      })
    });
    setBridge(bridge);
    const { result } = renderHook(() => useImportWorkflow());

    await waitFor(() => expect(result.current.notice?.title).toBe('The helper could not finish starting'));
    expect(result.current.notice?.message).toBe('Runtime configuration failed.');
    await act(async () => result.current.importMock());
    expect(result.current.notice).toMatchObject({
      tone: 'error',
      title: 'Something needs attention',
      message: 'Mock import failed.'
    });
    expect(result.current.busyAction).toBeNull();
  });

  it('handles manual session checks, login, and local-session clearing', async () => {
    const status = { isSignedIn: false, hasSwid: true, hasEspnS2: false };
    const bridge = createBridge({ getEspnSessionStatus: vi.fn(async () => status) });
    setBridge(bridge);
    const { result } = renderHook(() => useImportWorkflow());
    await waitFor(() => expect(result.current.settings.leagueId).toBe('424242'));

    await act(async () => result.current.openEspn());
    expect(bridge.openEspnLogin).toHaveBeenCalledWith({ leagueId: '424242', season: 2025 });
    expect(result.current.step).toBe('connect');
    expect(result.current.notice?.title).toBe('ESPN opened in a separate window');

    await act(async () => result.current.checkSession());
    expect(result.current.notice?.title).toBe('Sign-in not detected yet');
    await act(async () => result.current.clearSession());
    expect(bridge.clearEspnSession).toHaveBeenCalledOnce();
    expect(result.current.notice?.title).toBe('ESPN session cleared');
  });

  it('polls for sign-in while connecting and stops polling after detection', async () => {
    vi.useFakeTimers();
    const signedOut = { isSignedIn: false, hasSwid: false, hasEspnS2: false };
    const signedIn = { isSignedIn: true, hasSwid: true, hasEspnS2: true };
    const getEspnSessionStatus = vi.fn().mockResolvedValueOnce(signedOut).mockResolvedValueOnce(signedIn);
    const bridge = createBridge({ getEspnSessionStatus });
    setBridge(bridge);
    const { result } = renderHook(() => useImportWorkflow());
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    act(() => result.current.goToStep('connect'));
    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    expect(result.current.sessionStatus.isSignedIn).toBe(true);
    expect(result.current.notice?.title).toBe('ESPN session ready');
    expect(getEspnSessionStatus).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(getEspnSessionStatus).toHaveBeenCalledTimes(2);
  });

  it('imports warning-bearing history and handles canceled saves and tokenless uploads', async () => {
    const history = createMockHistoryImport([2025]);
    const bridge = createBridge({
      importFromEspn: vi.fn(async () => ({ history, warnings: ['Some transaction periods were unavailable.'] })),
      saveBundleToDisk: vi.fn(async () => ({ canceled: true }))
    });
    setBridge(bridge);
    const { result } = renderHook(() => useImportWorkflow());
    await waitFor(() => expect(result.current.settings.leagueId).toBe('424242'));

    await act(async () => result.current.importEspn());
    expect(result.current.step).toBe('preview');
    expect(result.current.notice).toMatchObject({
      title: 'Import ready with notes',
      message: 'Some transaction periods were unavailable.'
    });
    act(() =>
      result.current.setIncludedCategories((current) => ({
        ...current,
        transactions: false
      }))
    );
    expect(result.current.deliveryHistory?.seasons[0]?.transactions).toEqual([]);
    await act(async () => result.current.saveBundle());
    expect(result.current.notice).toBeNull();
    await act(async () => result.current.upload());
    expect(result.current.notice?.title).toBe('Open this helper from LeagueSaga to send data');
    expect(bridge.uploadBundle).not.toHaveBeenCalled();
  });

  it('cancels the active import and upload operations', async () => {
    let finishImport:
      ((value: { history: ReturnType<typeof createMockHistoryImport>; warnings: string[] }) => void) | undefined;
    const bridge = createBridge({
      importFromEspn: vi.fn(
        () =>
          new Promise<Awaited<ReturnType<LeagueSagaBridge['importFromEspn']>>>((resolve) => {
            finishImport = resolve;
          })
      ),
      cancelEspnImport: vi.fn(async () => {
        throw new Error('Cancel failed.');
      })
    });
    setBridge(bridge);
    const { result } = renderHook(() => useImportWorkflow());
    await waitFor(() => expect(result.current.settings.leagueId).toBe('424242'));

    act(() => void result.current.importEspn());
    await waitFor(() => expect(result.current.busyAction).toBe('importing'));
    await act(async () => result.current.cancelBusyAction());
    expect(bridge.cancelEspnImport).toHaveBeenCalledOnce();
    expect(result.current.notice?.message).toBe('Cancel failed.');
    await act(async () => finishImport?.({ history: createMockHistoryImport([2025]), warnings: [] }));

    act(() => result.current.setSettings((current) => ({ ...current, importToken: 'token' })));
    const upload = vi.mocked(bridge.uploadBundle);
    let finishUpload: ((value: Awaited<ReturnType<LeagueSagaBridge['uploadBundle']>>) => void) | undefined;
    upload.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve;
        })
    );
    act(() => void result.current.upload());
    await waitFor(() => expect(result.current.busyAction).toBe('uploading'));
    await act(async () => result.current.cancelBusyAction());
    expect(bridge.cancelUpload).toHaveBeenCalledOnce();
    await act(async () =>
      finishUpload?.({ ok: false, status: 0, code: 'canceled', message: 'Canceled.', retryable: false })
    );
  });

  it('opens the continuation URL and reports failures from external navigation', async () => {
    const bridge = createBridge({
      openLeagueSagaUrl: vi.fn(async () => {
        throw new Error('Navigation failed.');
      })
    });
    setBridge(bridge);
    const { result } = renderHook(() => useImportWorkflow());
    await waitFor(() => expect(result.current.settings.leagueId).toBe('424242'));
    act(() => result.current.setSettings({ ...result.current.settings, importToken: 'token' }));
    await act(async () => result.current.importMock());
    await act(async () => result.current.upload());
    await act(async () => result.current.continueInLeagueSaga());

    expect(bridge.openLeagueSagaUrl).toHaveBeenCalledWith('https://portal.leaguesaga.com/imports/1');
    expect(result.current.notice?.message).toBe('Navigation failed.');
  });
});
