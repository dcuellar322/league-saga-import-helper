// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMockHistoryImport, type LeagueSagaHistoryImport } from '@leaguesaga/import-contract';
import type { DeepLinkSettings, HelperSettings, LeagueSagaBridge } from '../shared/ipc';
import App from './App';

const defaultSettings: HelperSettings = {
  apiBaseUrl: 'http://localhost:15173',
  importToken: '',
  provider: 'espn',
  leagueId: ''
};

function mockHistory(): LeagueSagaHistoryImport {
  return { ...createMockHistoryImport([2025]), provider: 'espn' };
}

function createBridge(deepLink: DeepLinkSettings | null = null): LeagueSagaBridge {
  const history = mockHistory();
  return {
    appVersion: vi.fn(async () => '0.3.0'),
    runtimeConfig: vi.fn(async () => ({ apiBaseUrl: defaultSettings.apiBaseUrl, mockImportsEnabled: true })),
    rendererReady: vi.fn(async () => deepLink),
    getSettings: vi.fn(async () => defaultSettings),
    saveSettings: vi.fn(async (settings) => settings),
    openEspnLogin: vi.fn(async () => undefined),
    getEspnSessionStatus: vi.fn(async () => ({ isSignedIn: true, hasSwid: true, hasEspnS2: true })),
    clearEspnSession: vi.fn(async () => undefined),
    importFromEspn: vi.fn(async (params) => ({
      history: { ...history, importSessionId: params.importSessionId },
      warnings: []
    })),
    cancelEspnImport: vi.fn(async () => undefined),
    createMockImport: vi.fn(async () => ({ history, warnings: [] })),
    saveBundleToDisk: vi.fn(async () => ({ canceled: false, filePath: '/tmp/league-history.json' })),
    uploadBundle: vi.fn(async () => ({
      ok: true,
      status: 200,
      code: 'ok' as const,
      message: 'Uploaded.',
      retryable: false,
      continuationUrl: 'https://portal.leaguesaga.com/imports/preview/1'
    })),
    cancelUpload: vi.fn(async () => undefined),
    openLeagueSagaUrl: vi.fn(async () => undefined),
    openUpdateUrl: vi.fn(async () => undefined),
    openProjectUrl: vi.fn(async () => undefined),
    checkForUpdates: vi.fn(async () => ({ status: 'current' as const, currentVersion: '0.3.0' })),
    downloadUpdate: vi.fn(async () => undefined),
    installUpdate: vi.fn(async () => undefined),
    saveDiagnostics: vi.fn(async () => ({ canceled: false, filePath: '/tmp/diagnostics.jsonl' })),
    onDeepLink: vi.fn(() => () => undefined)
  };
}

function setBridge(bridge: LeagueSagaBridge): void {
  Object.defineProperty(window, 'leagueSaga', { configurable: true, value: bridge });
}

describe('import wizard', () => {
  beforeEach(() => setBridge(createBridge()));
  afterEach(() => cleanup());

  it('shows unavailable providers without allowing them to start a wizard', async () => {
    const bridge = createBridge();
    setBridge(bridge);
    const { container } = render(<App />);

    await screen.findByRole('heading', { name: 'Where does your league live?' });
    const espn = container.querySelector('.provider-card.espn') as HTMLButtonElement;
    const yahoo = container.querySelector('.provider-card.yahoo') as HTMLButtonElement;
    const sleeper = container.querySelector('.provider-card.sleeper') as HTMLButtonElement;

    expect(espn.disabled).toBe(false);
    expect(yahoo.disabled).toBe(true);
    expect(sleeper.disabled).toBe(true);
    fireEvent.click(yahoo);
    expect(screen.getByRole('heading', { name: 'Where does your league live?' })).toBeDefined();

    fireEvent.click(espn);
    expect(await screen.findByRole('heading', { name: 'League details' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Use development data/ }));
    await screen.findByRole('heading', { name: 'Review your league history' });
    expect(bridge.createMockImport).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: 'mock-league', season: undefined })
    );
  });

  it('carries a complete deep link through import review and upload', async () => {
    const bridge = createBridge({
      apiBaseUrl: 'https://portal.leaguesaga.com',
      importToken: 'one-time-token',
      importSessionId: 'import-session-1',
      provider: 'espn',
      leagueId: '424242',
      season: 2025
    });
    setBridge(bridge);
    const { container } = render(<App />);

    await screen.findByDisplayValue('424242');
    expect(screen.getByDisplayValue('2025')).toBeDefined();
    const root = container.querySelector('main.shell') as HTMLElement;
    await waitFor(() => expect(root.dataset.apiBaseUrl).toBe('https://portal.leaguesaga.com'));
    expect(root.dataset.importTokenPresent).toBe('true');
    expect(root.dataset.importSessionId).toBe('import-session-1');

    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    await screen.findByRole('heading', { name: 'Connect to ESPN' });
    fireEvent.click(screen.getByRole('button', { name: /Import ESPN history/ }));
    await screen.findByRole('heading', { name: 'Review your league history' });

    const rosters = screen.getByRole('checkbox', { name: /Rosters/ }) as HTMLInputElement;
    fireEvent.click(rosters);
    expect(rosters.checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Save history JSON/ }));
    await waitFor(() => expect(bridge.saveBundleToDisk).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    await screen.findByRole('dialog', { name: 'Settings' });
    fireEvent.click(screen.getByRole('button', { name: /Check for Updates/ }));
    await waitFor(() => expect(bridge.checkForUpdates).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: /Save diagnostics/ }));
    await waitFor(() => expect(bridge.saveDiagnostics).toHaveBeenCalledOnce());
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeDefined();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Send to LeagueSaga/ }));
    await screen.findByRole('heading', { name: 'Import delivered' });
    expect(bridge.uploadBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: 'https://portal.leaguesaga.com',
        importToken: 'one-time-token',
        bundle: expect.objectContaining({ importSessionId: 'import-session-1' })
      })
    );
    fireEvent.click(screen.getByRole('button', { name: /Continue in LeagueSaga/ }));
    await waitFor(() =>
      expect(bridge.openLeagueSagaUrl).toHaveBeenCalledWith('https://portal.leaguesaga.com/imports/preview/1')
    );
  });

  it('wires workflow navigation, project links, and available-update actions', async () => {
    const bridge = createBridge({
      apiBaseUrl: 'https://portal.leaguesaga.com',
      importToken: 'one-time-token',
      provider: 'espn',
      leagueId: '424242',
      season: 2025
    });
    bridge.checkForUpdates = vi.fn(async () => ({
      status: 'available' as const,
      currentVersion: '0.3.0',
      latestVersion: '0.4.0',
      releaseUrl: 'https://github.com/example/release'
    }));
    setBridge(bridge);
    render(<App />);

    await screen.findByDisplayValue('424242');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(screen.queryByText('Connected to LeagueSaga')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Use development data/ }));
    await screen.findByRole('heading', { name: 'Review your league history' });
    fireEvent.click(screen.getByRole('button', { name: /League details/ }));
    await screen.findByRole('heading', { name: 'League details' });
    fireEvent.click(screen.getByRole('button', { name: /Connect ESPN/ }));
    await screen.findByRole('heading', { name: 'Connect to ESPN' });
    fireEvent.click(screen.getByRole('button', { name: /Review data/ }));
    await screen.findByRole('heading', { name: 'Review your league history' });
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }));
    await screen.findByRole('heading', { name: 'Finish your import' });
    fireEvent.click(screen.getByRole('button', { name: /Choose provider/ }));
    await screen.findByRole('heading', { name: 'Where does your league live?' });

    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Security' }));
    await waitFor(() => expect(bridge.openProjectUrl).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    await screen.findByText('Version 0.4.0 is ready to download.');
    fireEvent.click(screen.getByRole('button', { name: /View release notes/ }));
    await waitFor(() => expect(bridge.openUpdateUrl).toHaveBeenCalledWith('https://github.com/example/release'));
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Download and restart/ }));
    await waitFor(() => expect(bridge.installUpdate).toHaveBeenCalledOnce());
  });
});
