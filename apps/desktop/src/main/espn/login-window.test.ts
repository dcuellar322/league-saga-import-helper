import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => {
  class BrowserWindow {
    static instances: BrowserWindow[] = [];
    options: Record<string, unknown>;
    destroyed = false;
    listeners = new Map<string, (...args: unknown[]) => void>();
    webContents = {
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        this.listeners.set(`webContents:${event}`, listener);
      })
    };
    loadURL = vi.fn(async () => undefined);
    focus = vi.fn();
    show = vi.fn();
    close = vi.fn(() => {
      this.destroyed = true;
      this.listeners.get('closed')?.();
    });
    isDestroyed = vi.fn(() => this.destroyed);
    once = vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      this.listeners.set(event, listener);
    });
    on = vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      this.listeners.set(event, listener);
    });

    constructor(options: Record<string, unknown>) {
      this.options = options;
      BrowserWindow.instances.push(this);
    }
  }

  return { BrowserWindow, app: { isPackaged: true } };
});

const espnSession = vi.hoisted(() => ({ setPermissionRequestHandler: vi.fn() }));
const security = vi.hoisted(() => ({
  hardenWindow: vi.fn(),
  isAllowedEspnAuthUrl: vi.fn((url: string) => url.startsWith('https://fantasy.espn.com/'))
}));

vi.mock('electron', () => electron);
vi.mock('./cookies.js', () => ({ getEspnSession: () => espnSession }));
vi.mock('../security.js', () => security);

import { closeEspnLoginWindow, openEspnLoginWindow } from './login-window.js';

describe('ESPN login window', () => {
  beforeEach(() => {
    closeEspnLoginWindow();
    electron.BrowserWindow.instances.length = 0;
    vi.clearAllMocks();
  });

  it('opens ESPN in a sandboxed isolated partition and denies permissions', async () => {
    await openEspnLoginWindow({ leagueId: '123', season: 2025 });

    const window = electron.BrowserWindow.instances[0];
    expect(window?.options).toMatchObject({
      webPreferences: {
        partition: 'leaguesaga-espn-import',
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true
      }
    });
    expect(window?.loadURL).toHaveBeenCalledWith('https://fantasy.espn.com/football/league?leagueId=123&seasonId=2025');
    expect(security.hardenWindow).toHaveBeenCalledWith(window);

    const permissionCallback = vi.fn();
    const permissionHandler = espnSession.setPermissionRequestHandler.mock.calls[0]?.[0];
    permissionHandler?.(undefined, undefined, permissionCallback);
    expect(permissionCallback).toHaveBeenCalledWith(false);
  });

  it('reuses the existing window and blocks unexpected direct navigation', async () => {
    await openEspnLoginWindow({});
    const window = electron.BrowserWindow.instances[0];
    await openEspnLoginWindow({ leagueId: '456', season: 2024 });
    expect(electron.BrowserWindow.instances).toHaveLength(1);
    expect(window?.focus).toHaveBeenCalledOnce();

    const event = { preventDefault: vi.fn() };
    const navigate = window?.listeners.get('webContents:will-navigate');
    navigate?.(event, 'https://evil.example/');
    expect(event.preventDefault).toHaveBeenCalledOnce();

    const allowedEvent = { preventDefault: vi.fn() };
    navigate?.(allowedEvent, 'https://fantasy.espn.com/football/');
    expect(allowedEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('shows the new window when ready and closes it explicitly', async () => {
    await openEspnLoginWindow({ season: 2023 });
    const window = electron.BrowserWindow.instances[0];
    window?.listeners.get('ready-to-show')?.();
    expect(window?.show).toHaveBeenCalledOnce();

    closeEspnLoginWindow();
    expect(window?.close).toHaveBeenCalledOnce();
  });
});
