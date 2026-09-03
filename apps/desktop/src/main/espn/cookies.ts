import { session } from 'electron';
import type { SessionStatus } from '../../shared/ipc.js';

export const ESPN_SESSION_PARTITION = 'leaguesaga-espn-import';

const IMPORTANT_COOKIE_NAMES = new Set(['SWID', 'espn_s2']);
const ESPN_COOKIE_HOSTS = ['espn.com', 'go.com', 'disney.com'];

function isEspnCookieDomain(domain: string): boolean {
  const hostname = domain.replace(/^\./, '').toLowerCase();
  return ESPN_COOKIE_HOSTS.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
}

export function getEspnSession() {
  return session.fromPartition(ESPN_SESSION_PARTITION, { cache: false });
}

export async function getEspnSessionStatus(): Promise<SessionStatus> {
  const cookies = await getEspnSession().cookies.get({});
  const espnCookies = cookies.filter((cookie) => isEspnCookieDomain(cookie.domain ?? ''));

  const cookieNames = new Set(espnCookies.map((cookie) => cookie.name));

  return {
    isSignedIn: cookieNames.has('SWID') && cookieNames.has('espn_s2'),
    hasSwid: cookieNames.has('SWID'),
    hasEspnS2: cookieNames.has('espn_s2')
  };
}

export async function buildEspnCookieHeader(): Promise<string> {
  const cookies = await getEspnSession().cookies.get({ url: 'https://fantasy.espn.com' });
  const importantCookies = cookies.filter((cookie) => IMPORTANT_COOKIE_NAMES.has(cookie.name));

  if (
    !importantCookies.some((cookie) => cookie.name === 'SWID') ||
    !importantCookies.some((cookie) => cookie.name === 'espn_s2')
  ) {
    throw new Error('ESPN session not detected. Sign in through the helper first.');
  }

  return importantCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

export async function clearEspnSession(): Promise<void> {
  const espnSession = getEspnSession();
  await espnSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers']
  });
  await espnSession.clearCache();
}
