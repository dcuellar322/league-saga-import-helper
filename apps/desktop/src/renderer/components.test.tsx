// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMockHistoryImport } from '@leaguesaga/import-contract';
import type { HelperSettings } from '../shared/ipc';
import {
  ConnectStep,
  LeagueDetailsStep,
  NoticeBanner,
  PreviewStep,
  SettingsModal,
  UploadStep,
  providerName
} from './components';
import { DEFAULT_INCLUDED_CATEGORIES } from './import-review';

afterEach(() => cleanup());

const settings: HelperSettings = {
  apiBaseUrl: 'http://localhost:15173',
  importToken: '',
  provider: 'espn',
  leagueId: '123456',
  season: 2025
};

describe('wizard components', () => {
  it('keeps future-provider screens available to the codebase but unreachable from provider selection', () => {
    render(
      <ConnectStep
        settings={{ ...settings, provider: 'sleeper' }}
        status={{ isSignedIn: false, hasSwid: false, hasEspnS2: false }}
        busyAction={null}
        canImport={false}
        onOpenEspn={vi.fn()}
        onRefresh={vi.fn()}
        onClear={vi.fn()}
        onImport={vi.fn()}
        onCancel={vi.fn()}
        onMock={vi.fn()}
        mockImportsEnabled={false}
      />
    );

    expect(screen.getByRole('heading', { name: 'Sleeper imports are not available in this build' })).toBeDefined();
  });

  it('parses an ESPN URL pasted into the league field', () => {
    const setSettings = vi.fn();
    render(
      <LeagueDetailsStep
        settings={{ ...settings, leagueId: '' }}
        setSettings={setSettings}
        busyAction={null}
        canContinue={false}
        leagueIdIsValid={false}
        seasonIsValid={true}
        hasImportSession={false}
        mockImportsEnabled={false}
        onContinue={vi.fn()}
        onMock={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Paste ESPN URL or League ID');
    fireEvent.paste(input, {
      clipboardData: { getData: () => 'https://fantasy.espn.com/football/league?leagueId=98765&seasonId=2024' }
    });
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ leagueId: '98765', season: 2024 }));
  });

  it('renders provider-specific detail variants and field validation', () => {
    const setSettings = vi.fn();
    const { rerender } = render(
      <LeagueDetailsStep
        settings={{ ...settings, provider: 'yahoo', leagueId: 'bad value', season: 1999 }}
        setSettings={setSettings}
        busyAction="mocking"
        canContinue={false}
        leagueIdIsValid={false}
        seasonIsValid={false}
        hasImportSession
        mockImportsEnabled
        onContinue={vi.fn()}
        onMock={vi.fn()}
      />
    );

    expect(screen.getByText('football.fantasysports.yahoo.com')).toBeDefined();
    expect(screen.getByText(/Enter a valid Yahoo/)).toBeDefined();
    expect(screen.getByText(/Enter a year from 2000/)).toBeDefined();
    fireEvent.change(screen.getByPlaceholderText('Paste Yahoo URL or League ID'), { target: { value: ' 12345 ' } });
    fireEvent.change(screen.getByPlaceholderText('Select start year'), { target: { value: '' } });
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ leagueId: '12345' }));
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ season: undefined }));

    rerender(
      <LeagueDetailsStep
        settings={{ ...settings, provider: 'sleeper' }}
        setSettings={setSettings}
        busyAction={null}
        canContinue
        leagueIdIsValid
        seasonIsValid
        hasImportSession={false}
        mockImportsEnabled={false}
        onContinue={vi.fn()}
        onMock={vi.fn()}
      />
    );
    expect(screen.getByText('sleeper.com')).toBeDefined();
    expect(providerName('sleeper')).toBe('Sleeper');
    expect(providerName('invalid' as 'espn')).toBe('League provider');
  });

  it('renders disconnected, connected, and busy ESPN session states', () => {
    const onRefresh = vi.fn();
    const onClear = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConnectStep
        settings={settings}
        status={{ isSignedIn: false, hasSwid: true, hasEspnS2: false }}
        busyAction="opening-espn"
        canImport
        onOpenEspn={vi.fn()}
        onRefresh={onRefresh}
        onClear={onClear}
        onImport={vi.fn()}
        onCancel={onCancel}
        onMock={vi.fn()}
        mockImportsEnabled
      />
    );
    expect(screen.getByText('Detected locally')).toBeDefined();
    expect(screen.getByText('Waiting')).toBeDefined();

    rerender(
      <ConnectStep
        settings={{ ...settings, season: undefined }}
        status={{ isSignedIn: false, hasSwid: false, hasEspnS2: false }}
        busyAction={null}
        canImport
        onOpenEspn={vi.fn()}
        onRefresh={onRefresh}
        onClear={onClear}
        onImport={vi.fn()}
        onCancel={onCancel}
        onMock={vi.fn()}
        mockImportsEnabled
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Check sign-in status/ }));
    fireEvent.click(screen.getByRole('button', { name: /Clear local ESPN session/ }));
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onClear).toHaveBeenCalledOnce();

    rerender(
      <ConnectStep
        settings={settings}
        status={{ isSignedIn: true, hasSwid: true, hasEspnS2: true }}
        busyAction="importing"
        canImport
        onOpenEspn={vi.fn()}
        onRefresh={onRefresh}
        onClear={onClear}
        onImport={vi.fn()}
        onCancel={onCancel}
        onMock={vi.fn()}
        mockImportsEnabled={false}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel import/ }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders empty and completed finish states', () => {
    const history = createMockHistoryImport([2025]);
    const props = {
      busyAction: null,
      canUpload: false,
      mockImportsEnabled: false,
      onSave: vi.fn(),
      onUpload: vi.fn(),
      onCancel: vi.fn(),
      onContinue: vi.fn()
    } as const;

    const { rerender } = render(<UploadStep {...props} history={null} result={null} />);
    expect(screen.getByRole('heading', { name: 'No import to finish' })).toBeDefined();
    rerender(
      <UploadStep
        {...props}
        history={history}
        result={{ ok: true, status: 200, code: 'ok', message: 'Done.', retryable: false }}
      />
    );
    expect(screen.getByRole('heading', { name: 'Import delivered' })).toBeDefined();
    expect(screen.getByText(/Return to the LeagueSaga browser tab/)).toBeDefined();
  });

  it('renders preview and settings edge states', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <NoticeBanner notice={{ tone: 'error', title: 'Problem', message: 'Try again.' }} onDismiss={onDismiss} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(onDismiss).toHaveBeenCalledOnce();

    rerender(
      <PreviewStep
        sourceHistory={null}
        history={null}
        includedCategories={DEFAULT_INCLUDED_CATEGORIES}
        setIncludedCategories={vi.fn()}
        busyAction={null}
        canUpload={false}
        mockImportsEnabled={true}
        onSave={vi.fn()}
        onUpload={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole('heading', { name: 'Nothing to review yet' })).toBeDefined();

    const onClose = vi.fn();
    rerender(
      <SettingsModal
        version="0.3.0"
        updateInfo={{
          status: 'available',
          currentVersion: '0.3.0',
          latestVersion: '0.4.0',
          releaseUrl: 'https://github.com/dcuellar322/league-saga-import-helper/releases/tag/v0.4.0'
        }}
        updateBusy={null}
        onClose={onClose}
        onCheckForUpdates={vi.fn()}
        onDownloadAndInstall={vi.fn()}
        onOpenRelease={vi.fn()}
        onSaveDiagnostics={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Download and restart/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /View release notes/ })).toBeDefined();
    fireEvent.mouseDown(document.querySelector('.modal-backdrop')!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('covers preview controls, JSON inspection, and failed uploads', async () => {
    const history = createMockHistoryImport([2024, 2025]);
    history.seasons[0]!.teams[0]!.ownerDisplayNames = [];
    const setIncludedCategories = vi.fn();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { rerender } = render(
      <PreviewStep
        sourceHistory={history}
        history={history}
        includedCategories={DEFAULT_INCLUDED_CATEGORIES}
        setIncludedCategories={setIncludedCategories}
        busyAction="uploading"
        canUpload
        mockImportsEnabled={false}
        onSave={vi.fn()}
        onUpload={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('No owner name returned by provider')).toBeDefined();
    fireEvent.click(screen.getByRole('checkbox', { name: /Transactions/ }));
    expect(setIncludedCategories).toHaveBeenCalledWith(expect.objectContaining({ transactions: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect complete history JSON' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    await screen.findByText('Copied');
    writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Copied' }));
    await screen.findByText('Copy failed');

    rerender(
      <UploadStep
        history={history}
        result={{
          ok: false,
          status: 503,
          code: 'unavailable',
          message: 'Try later.',
          retryable: true,
          response: { error: 'unavailable' }
        }}
        busyAction={null}
        canUpload
        mockImportsEnabled={false}
        onSave={vi.fn()}
        onUpload={vi.fn()}
        onCancel={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Retry upload/ })).toBeDefined();
    expect(screen.getByRole('button', { name: 'View LeagueSaga response' })).toBeDefined();

    rerender(
      <UploadStep
        history={history}
        result={{
          ok: true,
          status: 200,
          code: 'ok',
          message: 'Done.',
          retryable: false,
          continuationUrl: 'https://portal.leaguesaga.com/imports/1'
        }}
        busyAction={null}
        canUpload
        mockImportsEnabled={false}
        onSave={vi.fn()}
        onUpload={vi.fn()}
        onCancel={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Continue in LeagueSaga/ })).toBeDefined();
  });
});
