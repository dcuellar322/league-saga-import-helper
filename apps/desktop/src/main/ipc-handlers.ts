import { app, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { platform } from 'node:process';
import { createMockImportBundle, validateImportBundle } from '@leaguesaga/import-contract';
import type { DeepLinkSettings, HelperSettings, ImportParams, UploadParams } from '../shared/ipc.js';
import { currentSeasonYear, defaultLeagueSagaApiBaseUrl } from '../shared/environment.js';
import { clearEspnSession, getEspnSessionStatus } from './espn/cookies.js';
import { closeEspnLoginWindow, openEspnLoginWindow } from './espn/login-window.js';
import { fetchEspnLeaguePayload } from './espn/api.js';
import { transformEspnPayload } from './espn/transform.js';
import { exportDiagnostics, recordDiagnostic } from './diagnostics.js';
import { openTrustedLeagueSagaUrl, openTrustedProjectUrl, openTrustedUpdateUrl } from './security.js';
import { readSettings, saveSettings } from './settings.js';
import { checkForUpdates } from './updates.js';
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
    const season = parsedParams.season ?? currentSeasonYear();
    activeEspnImport?.abort();
    const controller = new AbortController();
    activeEspnImport = controller;
    closeEspnLoginWindow();
    await recordDiagnostic('espn_import_started', {
      season,
      hasImportSessionId: Boolean(parsedParams.importSessionId)
    });
    try {
      const payload = await fetchEspnLeaguePayload(
        { leagueId: parsedParams.leagueId, season },
        { signal: controller.signal }
      );
      const bundle = transformEspnPayload(payload, {
        leagueId: parsedParams.leagueId,
        season,
        importSessionId: parsedParams.importSessionId,
        helperVersion: app.getVersion(),
        platform
      });
      await recordDiagnostic('espn_import_completed', {
        teams: bundle.teams.length,
        rosters: bundle.rosterEntries.length,
        matchups: bundle.matchups.length,
        warnings: bundle.metadata.warnings.length
      });
      return { bundle, warnings: bundle.metadata.warnings };
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
    const season = parsedParams.season ?? currentSeasonYear();
    const bundle = createMockImportBundle({
      metadata: {
        contractVersion: '0.1.0',
        source: 'mock',
        generatedAt: new Date().toISOString(),
        helper: {
          name: 'LeagueSaga Import Helper',
          version: app.getVersion(),
          platform
        },
        importSessionId: parsedParams.importSessionId,
        warnings: ['Mock import generated locally. No ESPN request was made.']
      },
      league: {
        externalRef: { provider: 'mock', externalId: parsedParams.leagueId },
        name: 'LeagueSaga Demo League',
        season,
        size: 2,
        visibility: 'private',
        settings: { mode: 'mock' }
      }
    });
    return { bundle, warnings: bundle.metadata.warnings };
  });
  handleTrusted(options, 'bundle:save-to-disk', async (input: unknown) => {
    const bundle = validateImportBundle(input);
    const defaultPath = join(
      app.getPath('documents'),
      `leaguesaga-import-${bundle.league.season}-${bundle.league.externalRef.externalId}.json`
    );
    const result = await dialog.showSaveDialog({
      title: 'Save LeagueSaga Import Bundle',
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
