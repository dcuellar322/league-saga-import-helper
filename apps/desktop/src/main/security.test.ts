import { beforeEach, describe, expect, it, vi } from 'vitest';

const openExternal = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('electron', () => ({ shell: { openExternal } }));

import {
  hardenRendererNavigation,
  hardenWindow,
  isAllowedEspnAuthUrl,
  openTrustedLeagueSagaUrl,
  openTrustedProjectUrl,
  openTrustedUpdateUrl
} from './security.js';

describe('window and external navigation security', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows only HTTPS ESPN authentication hosts', () => {
    expect(isAllowedEspnAuthUrl('https://fantasy.espn.com/football/')).toBe(true);
    expect(isAllowedEspnAuthUrl('https://cdn.registerdisney.go.com/login')).toBe(true);
    expect(isAllowedEspnAuthUrl('http://fantasy.espn.com/football/')).toBe(false);
    expect(isAllowedEspnAuthUrl('https://fantasy.espn.com.evil.example/')).toBe(false);
    expect(isAllowedEspnAuthUrl('not a URL')).toBe(false);
  });

  it('opens only purpose-specific LeagueSaga and GitHub URLs', () => {
    openTrustedLeagueSagaUrl('https://portal.leaguesaga.com/imports/1');
    openTrustedLeagueSagaUrl('https://www.leaguesaga.com/imports/1');
    openTrustedUpdateUrl('https://github.com/dcuellar322/league-saga-import-helper/releases/tag/v0.2.0');
    openTrustedProjectUrl('https://github.com/dcuellar322/league-saga-import-helper/blob/master/docs/PRIVACY.md');
    expect(openExternal).toHaveBeenCalledTimes(4);

    expect(() => openTrustedLeagueSagaUrl('https://github.com/')).toThrow('Rejected untrusted LeagueSaga URL');
    expect(() => openTrustedUpdateUrl('https://github.com/example/project/releases/1')).toThrow(
      'Rejected untrusted update URL'
    );
    expect(() => openTrustedProjectUrl('https://github.com/dcuellar322/another-project/')).toThrow(
      'Rejected untrusted project URL'
    );
  });

  it('blocks renderer navigation and opens only trusted external destinations', () => {
    let openHandler: ((details: { url: string }) => { action: string }) | undefined;
    let navigateHandler: ((event: { preventDefault: () => void }, url: string) => void) | undefined;
    const webContents = {
      setWindowOpenHandler: (handler: typeof openHandler) => {
        openHandler = handler;
      },
      on: (_event: string, handler: typeof navigateHandler) => {
        navigateHandler = handler;
      }
    };
    hardenRendererNavigation(webContents as never, (url) => url === 'app://bundle/index.html');

    expect(openHandler?.({ url: 'https://www.leaguesaga.com/help' })).toEqual({ action: 'deny' });
    expect(openHandler?.({ url: 'https://evil.example/' })).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledTimes(1);

    const allowedEvent = { preventDefault: vi.fn() };
    navigateHandler?.(allowedEvent, 'app://bundle/index.html');
    expect(allowedEvent.preventDefault).not.toHaveBeenCalled();

    const blockedEvent = { preventDefault: vi.fn() };
    navigateHandler?.(blockedEvent, 'https://github.com/dcuellar322/league-saga-import-helper/');
    expect(blockedEvent.preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledTimes(2);
  });

  it('keeps ESPN popups in the isolated window and rejects unrelated navigation', () => {
    let openHandler: ((details: { url: string }) => { action: string }) | undefined;
    let navigateHandler: ((event: { preventDefault: () => void }, url: string) => void) | undefined;
    const loadURL = vi.fn(async () => undefined);
    const window = {
      loadURL,
      webContents: {
        setWindowOpenHandler: (handler: typeof openHandler) => {
          openHandler = handler;
        },
        on: (_event: string, handler: typeof navigateHandler) => {
          navigateHandler = handler;
        }
      }
    };
    hardenWindow(window as never);

    expect(openHandler?.({ url: 'https://fantasy.espn.com/login' })).toEqual({ action: 'deny' });
    expect(loadURL).toHaveBeenCalledWith('https://fantasy.espn.com/login');

    const event = { preventDefault: vi.fn() };
    navigateHandler?.(event, 'https://evil.example/');
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});
