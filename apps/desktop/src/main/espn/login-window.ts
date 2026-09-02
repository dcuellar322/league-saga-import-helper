import { app, BrowserWindow } from 'electron';
import { getEspnSession } from './cookies.js';
import { hardenWindow, isAllowedEspnAuthUrl } from '../security.js';
import { currentSeasonYear } from '../../shared/environment.js';

type OpenEspnLoginParams = {
  leagueId?: string;
  season?: number;
};

let loginWindow: BrowserWindow | null = null;

export async function openEspnLoginWindow(params: OpenEspnLoginParams): Promise<void> {
  if (loginWindow && !loginWindow.isDestroyed()) {
    await loginWindow.loadURL(buildFantasyUrl(params));
    loginWindow.focus();
    return;
  }

  const espnSession = getEspnSession();
  espnSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  loginWindow = new BrowserWindow({
    title: 'Sign in to ESPN - LeagueSaga Import Helper',
    width: 1120,
    height: 860,
    minWidth: 900,
    minHeight: 700,
    show: false,
    backgroundColor: '#07152c',
    webPreferences: {
      partition: 'leaguesaga-espn-import',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged
    }
  });

  hardenWindow(loginWindow);

  loginWindow.once('ready-to-show', () => loginWindow?.show());
  loginWindow.on('closed', () => {
    loginWindow = null;
  });

  loginWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedEspnAuthUrl(url)) {
      event.preventDefault();
    }
  });

  const target = buildFantasyUrl(params);
  await loginWindow.loadURL(target);
}

export function closeEspnLoginWindow(): void {
  if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
  loginWindow = null;
}

function buildFantasyUrl(params: OpenEspnLoginParams): string {
  const season = params.season ?? currentSeasonYear();
  if (params.leagueId) {
    return `https://fantasy.espn.com/football/league?leagueId=${encodeURIComponent(params.leagueId)}&seasonId=${season}`;
  }
  return `https://fantasy.espn.com/football/`;
}
