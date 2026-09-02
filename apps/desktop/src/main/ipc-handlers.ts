import { app, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { platform } from 'node:process';
import { createMockHistoryImport, validateImportPayload } from '@leaguesaga/import-contract';
import type { DeepLinkSettings, HelperSettings, ImportParams, UploadParams } from '../shared/ipc.js';
import { currentSeasonYear, defaultLeagueSagaApiBaseUrl } from '../shared/environment.js';
import { clearEspnSession, getEspnSessionStatus } from './espn/cookies.js';
import { closeEspnLoginWindow, openEspnLoginWindow } from './espn/login-window.js';
import { importEspnHistory, inclusiveSeasonRange } from './espn/history.js';
import { exportDiagnostics, recordDiagnostic } from './diagnostics.js';
import { openTrustedLeagueSagaUrl, openTrustedProjectUrl, openTrustedUpdateUrl } from './security.js';
import { readSettings, saveSettings } from './settings.js';
import { checkForUpdates, downloadUpdate, installUpdate } from './updates.js';
import { uploadBundle } from './upload.js';
import { EspnImportParamsSchema, EspnOpenLoginParamsSchema, MockImportParamsSchema } from './validation.js';

type RegisterIpcHandlersOptions = {
  isTrustedRendererUrl: (url: string) => boolean;
  onRendererReady: () => DeepLinkSettings | null;
};

let activeEspnImport: AbortController | null = null;
let activeUpload: AbortController | null = null;

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  handleTrusted(options, 'app:version', () => app.getVersion());
  handleTrusted(options, 'app:runtime-config', () => ({
    apiBaseUrl: process.env.LEAGUESAGA_API_BASE ?? defaultLeagueSagaApiBaseUrl(app.isPackaged),
    isDevelopment: !app.isPackaged,
    mockImportsEnabled: !app.isPackaged
  }));
  handleTrusted(options, 'app:renderer-ready', options.onRendererReady);
  handleTrusted(options, 'settings:get', () => readSettings());
  handleTrusted(options, 'settings:save', (settings: HelperSettings) => saveSettings(settings));
  handleTrusted(options, 'espn:open-login', (params: Pick<ImportParams, 'leagueId' | 'season'>) => {
    const parsedParams = EspnOpenLoginParamsSchema.parse(params);
    return openEspnLoginWindow(parsedParams);
  });
  handleTrusted(options, 'espn:session-status', () => getEspnSessionStatus());
  handleTrusted(options, 'espn:clear-session', async () => {
    closeEspnLoginWindow();
    await clearEspnSession();
  });
  handleTrusted(options, 'espn:import', async (params: ImportParams) => {
    const parsedParams = EspnImportParamsSchema.parse(params);
    const currentSeason = currentSeasonYear();
    activeEspnImport?.abort();
    const controller = new AbortController();
    activeEspnImport = controller;
    closeEspnLoginWindow();
    await recordDiagnostic('espn_import_started', {
      startYear: parsedParams.season,
      currentSeason,
      hasImportSessionId: Boolean(parsedParams.importSessionId)
    });
    try {
      const history = await importEspnHistory(
        {
          leagueId: parsedParams.leagueId,
          startYear: parsedParams.season,
          importSessionId: parsedParams.importSessionId
        },
        {
          currentSeason,
          helperVersion: app.getVersion(),
          platform,
          signal: controller.signal
        }
      );
      await recordDiagnostic('espn_import_completed', {
        seasons: history.seasons.length,
        teams: history.seasons.reduce((total, bundle) => total + bundle.teams.length, 0),
        rosters: history.seasons.reduce((total, bundle) => total + bundle.rosterEntries.length, 0),
        matchups: history.seasons.reduce((total, bundle) => total + bundle.matchups.length, 0),
        warnings: history.warnings.length
      });
      return {
        history,
        warnings: [
          ...history.warnings,
          ...history.seasons.flatMap((bundle) => bundle.warnings.map((warning) => `${bundle.season}: ${warning}`))
        ]
      };
    } catch (error) {
      await recordDiagnostic('espn_import_failed', {
        reason:
          error instanceof Error && error.message === 'Import canceled.' ? 'canceled' : 'request_or_validation_error'
      });
      throw error;
    } finally {
      if (activeEspnImport === controller) activeEspnImport = null;
    }
  });
  handleTrusted(options, 'espn:cancel-import', () => {
    activeEspnImport?.abort();
  });
  handleTrusted(options, 'mock:import', (params: ImportParams) => {
    const parsedParams = MockImportParamsSchema.parse(params);
    const currentSeason = currentSeasonYear();
    const firstSeason = parsedParams.season ?? Math.max(2000, currentSeason - 2);
    const history = createMockHistoryImport(inclusiveSeasonRange(firstSeason, currentSeason), {
      leagueExternalId: parsedParams.leagueId,
      importSessionId: parsedParams.importSessionId,
      helperVersion: app.getVersion(),
      platform
    });
    return { history, warnings: history.warnings };
  });
  handleTrusted(options, 'bundle:save-to-disk', async (input: unknown) => {
    const bundle = validateImportPayload(input);
    const leagueExternalId = bundle.leagueExternalId;
    const seasonLabel = `${bundle.startSeason}-${bundle.endSeason}`;
    const defaultPath = join(app.getPath('documents'), `leaguesaga-import-${seasonLabel}-${leagueExternalId}.json`);
    const result = await dialog.showSaveDialog({
      title: 'Save LeagueSaga Import Package',
      defaultPath,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await mkdir(dirname(result.filePath), { recursive: true });
    await writeFile(result.filePath, JSON.stringify(bundle, null, 2), 'utf-8');
    return { canceled: false, filePath: result.filePath };
  });
  handleTrusted(options, 'bundle:upload', async (params: UploadParams) => {
    activeUpload?.abort();
    const controller = new AbortController();
    activeUpload = controller;
    try {
      const result = await uploadBundle(params, controller.signal);
      await recordDiagnostic('bundle_upload_finished', {
        ok: result.ok,
        status: result.status,
        code: result.code
      });
      return result;
    } finally {
      if (activeUpload === controller) activeUpload = null;
    }
  });
  handleTrusted(options, 'bundle:cancel-upload', () => {
    activeUpload?.abort();
  });
  handleTrusted(options, 'app:open-leaguesaga-url', (url: string) => openTrustedLeagueSagaUrl(url));
  handleTrusted(options, 'app:open-update-url', (url: string) => openTrustedUpdateUrl(url));
  handleTrusted(options, 'app:open-project-url', (url: string) => openTrustedProjectUrl(url));
  handleTrusted(options, 'app:check-for-updates', () => checkForUpdates());
  handleTrusted(options, 'app:download-update', () => downloadUpdate());
  handleTrusted(options, 'app:install-update', () => installUpdate());
  handleTrusted(options, 'diagnostics:save', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Save privacy-safe diagnostics',
      defaultPath: join(
        app.getPath('documents'),
        `league-saga-import-helper-diagnostics-${new Date().toISOString().slice(0, 10)}.jsonl`
      ),
      filters: [{ name: 'JSON Lines', extensions: ['jsonl'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await exportDiagnostics(result.filePath);
    return { canceled: false, filePath: result.filePath };
  });
}

function handleTrusted<Args extends unknown[]>(
  options: RegisterIpcHandlersOptions,
  channel: string,
  listener: (...args: Args) => unknown
): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpcSender(event, options.isTrustedRendererUrl);
    return listener(...(args as Args));
  });
}

export function assertTrustedIpcSender(
  event: IpcMainInvokeEvent,
  isTrustedRendererUrl: (url: string) => boolean
): void {
  const frameUrl = event.senderFrame?.url ?? event.sender.getURL();
  if (!isTrustedRendererUrl(frameUrl)) {
    throw new Error('Rejected IPC call from an untrusted renderer.');
  }
}
