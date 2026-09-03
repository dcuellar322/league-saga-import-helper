import { beforeEach, describe, expect, it, vi } from 'vitest';

type TestCookie = { name: string; value: string; domain?: string };

const electronSession = vi.hoisted(() => {
  const get = vi.fn(async (_filter: object): Promise<TestCookie[]> => []);
  const clearStorageData = vi.fn(async () => undefined);
  const clearCache = vi.fn(async () => undefined);
  const value = { cookies: { get }, clearStorageData, clearCache };
  return {
    get,
    clearStorageData,
    clearCache,
    fromPartition: vi.fn(() => value)
  };
});

vi.mock('electron', () => ({
  session: { fromPartition: electronSession.fromPartition }
}));

import {
  ESPN_SESSION_PARTITION,
  buildEspnCookieHeader,
  clearEspnSession,
  getEspnSession,
  getEspnSessionStatus
} from './cookies.js';

describe('isolated ESPN cookie session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronSession.get.mockResolvedValue([]);
  });

  it('uses a nonpersistent partition and recognizes only exact ESPN-related domains', async () => {
    electronSession.get.mockResolvedValue([
      { name: 'SWID', value: 'identity', domain: '.espn.com' },
      { name: 'espn_s2', value: 'session', domain: 'secure.espn.com' },
      { name: 'espn_s2', value: 'imposter', domain: 'notespn.com' },
      { name: 'other', value: 'value', domain: '.disney.com' }
    ]);

    expect(getEspnSession()).toBeDefined();
    expect(electronSession.fromPartition).toHaveBeenCalledWith(ESPN_SESSION_PARTITION, { cache: false });
    await expect(getEspnSessionStatus()).resolves.toMatchObject({
      isSignedIn: true,
      hasSwid: true,
      hasEspnS2: true
    });
  });

  it('builds a header from only the two required credentials', async () => {
    electronSession.get.mockResolvedValue([
      { name: 'SWID', value: 'identity' },
      { name: 'espn_s2', value: 'session' },
      { name: 'unrelated', value: 'ignore-me' }
    ]);

    await expect(buildEspnCookieHeader()).resolves.toBe('SWID=identity; espn_s2=session');
    expect(electronSession.get).toHaveBeenCalledWith({ url: 'https://fantasy.espn.com' });
  });

  it('rejects incomplete credentials and clears all helper session storage', async () => {
    electronSession.get.mockResolvedValue([{ name: 'SWID', value: 'identity' }]);
    await expect(buildEspnCookieHeader()).rejects.toThrow('ESPN session not detected');

    await clearEspnSession();
    expect(electronSession.clearStorageData).toHaveBeenCalledWith({
      storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers']
    });
    expect(electronSession.clearCache).toHaveBeenCalledOnce();
  });
});
