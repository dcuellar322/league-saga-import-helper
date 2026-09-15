import { app, BrowserWindow, Menu, net, protocol } from 'electron';
import started from 'electron-squirrel-startup';
import { join, resolve, sep } from 'node:path';
import { platform } from 'node:process';
import { pathToFileURL } from 'node:url';
import type { DeepLinkSettings } from '../shared/ipc.js';
import { hardenRendererNavigation } from './security.js';
import { getEspnSession } from './espn/cookies.js';
import { recordDiagnostic } from './diagnostics.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { findDeepLinkArg, isAllowedLocalRendererUrl, parseDeepLinkSettings } from './validation.js';

if (started) app.quit();

let mainWindow: BrowserWindow | null = null;
let pendingDeepLink: DeepLinkSettings | null = null;
let rendererReady = false;

const protocolName = 'leaguesaga-import';

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(protocolName, process.execPath, [process.argv[1]]);
  }
} else if (!process.windowsStore) {
  // Packaged Windows protocol registration comes from the MSIX manifest.
  app.setAsDefaultProtocolClient(protocolName);
}

if (!app.requestSingleInstanceLock()) app.quit();

app.on('second-instance', (_event, argv) => {
  const url = findDeepLinkArg(argv);
  if (url) acceptDeepLink(url);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  acceptDeepLink(url);
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true
    }
  }
]);

async function createWindow(): Promise<void> {
  rendererReady = false;
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 760,
    minHeight: 620,
    title: 'LeagueSaga Import Helper',
    backgroundColor: '#07152c',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged
    }
  });

  hardenRendererNavigation(mainWindow.webContents, isTrustedRendererUrl);
  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
  });
  mainWindow.webContents.on('did-start-loading', () => {
    rendererReady = false;
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  const rendererDevUrl = getRendererDevUrl();
  await mainWindow.loadURL(rendererDevUrl ?? 'app://bundle/index.html');

  if (process.argv.includes('--smoke-test')) await runPackagedSmokeTest(mainWindow);
}

async function runPackagedSmokeTest(window: BrowserWindow): Promise<void> {
  const deepLink = findDeepLinkArg(process.argv);
  const expected = deepLink ? parseDeepLinkSettings(deepLink, { allowLocalhost: false }) : null;
  if (
    !expected?.apiBaseUrl ||
    !expected.importToken ||
    !expected.importSessionId ||
    !expected.leagueId ||
    !expected.season
  ) {
    throw new Error('Packaged smoke test requires a complete production deep link.');
  }
  const expectedRendererState = JSON.stringify({
    apiBaseUrl: expected.apiBaseUrl,
    hasImportToken: true,
    importSessionId: expected.importSessionId,
    leagueId: expected.leagueId,
    season: String(expected.season)
  });
  const rendered = (await window.webContents.executeJavaScript(`(async () => {
    const expected = ${expectedRendererState};
    const deadline = Date.now() + 5000;
    let state;
    while (Date.now() < deadline) {
      const root = document.querySelector('main.shell');
      const inputValues = Array.from(document.querySelectorAll('input')).map((input) => input.value);
      state = {
        hasBridge: Boolean(window.leagueSaga),
        hasHeading: document.body.textContent.includes('League details'),
        apiBaseUrl: root?.dataset.apiBaseUrl,
        hasImportToken: root?.dataset.importTokenPresent === 'true',
        importSessionId: root?.dataset.importSessionId,
        leagueId: inputValues.find((value) => value === expected.leagueId),
        season: inputValues.find((value) => value === expected.season)
      };
      if (
        state.hasBridge &&
        state.hasHeading &&
        state.apiBaseUrl === expected.apiBaseUrl &&
        state.hasImportToken === expected.hasImportToken &&
        state.importSessionId === expected.importSessionId &&
        state.leagueId === expected.leagueId &&
        state.season === expected.season
      ) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return state;
  })()`)) as {
    hasBridge: boolean;
    hasHeading: boolean;
    apiBaseUrl?: string;
    hasImportToken: boolean;
    importSessionId?: string;
    leagueId?: string;
    season?: string;
  };
  if (
    !rendered.hasBridge ||
    !rendered.hasHeading ||
    rendered.apiBaseUrl !== expected.apiBaseUrl ||
    !rendered.hasImportToken ||
    rendered.importSessionId !== expected.importSessionId ||
    rendered.leagueId !== expected.leagueId ||
    rendered.season !== String(expected.season)
  ) {
    throw new Error(`Packaged smoke test failed: ${JSON.stringify(rendered)}`);
  }
  process.stdout.write('PACKAGED_SMOKE_OK\n');
  app.exit(0);
}

function acceptDeepLink(url: string): void {
  const settings = parseDeepLinkSettings(url, { allowLocalhost: !app.isPackaged });
  if (!settings) return;
  void recordDiagnostic('deep_link_accepted', {
    hasToken: Boolean(settings.importToken),
    hasLeagueId: Boolean(settings.leagueId),
    hasSeason: Boolean(settings.season),
    hasImportSessionId: Boolean(settings.importSessionId)
  });
  notifyDeepLink(settings);
}

function notifyDeepLink(settings: DeepLinkSettings): void {
  if (!mainWindow || mainWindow.isDestroyed() || !rendererReady) {
    pendingDeepLink = settings;
    return;
  }
  mainWindow.webContents.send('app:deep-link', settings);
}

app.whenReady().then(async () => {
  if (app.isPackaged) Menu.setApplicationMenu(null);
  protocol.handle('app', handleAppProtocolRequest);
  getEspnSession().setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  registerIpcHandlers({
    isTrustedRendererUrl,
    onRendererReady: () => {
      rendererReady = true;
      const settings = pendingDeepLink;
      pendingDeepLink = null;
      return settings;
    }
  });
  const initialDeepLink = findDeepLinkArg(process.argv);
  if (initialDeepLink) acceptDeepLink(initialDeepLink);
  await createWindow();
  await recordDiagnostic('app_ready', { version: app.getVersion(), platform, packaged: app.isPackaged });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

function getRendererDevUrl(): string | null {
  const url = process.env.ELECTRON_RENDERER_URL;
  if (!url || app.isPackaged || !isAllowedLocalRendererUrl(url)) return null;
  return url;
}

function isTrustedRendererUrl(url: string): boolean {
  if (url === 'app://bundle/index.html') return true;
  return !app.isPackaged && isAllowedLocalRendererUrl(url);
}

function handleAppProtocolRequest(request: Request): Promise<Response> {
  const parsed = new URL(request.url);
  if (parsed.host !== 'bundle') return Promise.resolve(new Response('Not found', { status: 404 }));
  const rendererRoot = resolve(__dirname, '../renderer');
  const relativePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, '') || 'index.html';
  const filePath = resolve(rendererRoot, relativePath);
  if (filePath !== rendererRoot && !filePath.startsWith(`${rendererRoot}${sep}`)) {
    return Promise.resolve(new Response('Not found', { status: 404 }));
  }
  return net.fetch(pathToFileURL(filePath).toString());
}
