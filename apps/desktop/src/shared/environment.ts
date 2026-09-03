const LEAGUESAGA_DEV_API_BASE_URL = 'http://localhost:15173';
const LEAGUESAGA_PRODUCTION_API_BASE_URL = 'https://portal.leaguesaga.com';

export function defaultLeagueSagaApiBaseUrl(isPackaged: boolean): string {
  return isPackaged ? LEAGUESAGA_PRODUCTION_API_BASE_URL : LEAGUESAGA_DEV_API_BASE_URL;
}

export function currentSeasonYear(): number {
  return currentEspnSeasonYear();
}

export function currentEspnSeasonYear(now = new Date()): number {
  return now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
}
