import { buildEspnCookieHeader } from './cookies.js';

export type EspnFetchParams = {
  leagueId: string;
  season: number;
};

type FetchOptions = { signal?: AbortSignal };

const DEFAULT_VIEWS = [
  'mSettings',
  'mTeam',
  'mRoster',
  'mMatchup',
  'mMatchupScore',
  'mStatus',
  'mDraftDetail',
  'mTransactions2'
];

export async function fetchEspnLeaguePayload(params: EspnFetchParams, options: FetchOptions = {}): Promise<unknown> {
  const cookieHeader = await buildEspnCookieHeader();
  const url = new URL(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${params.season}/segments/0/leagues/${encodeURIComponent(params.leagueId)}`
  );

  for (const view of DEFAULT_VIEWS) {
    url.searchParams.append('view', view);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const timeout = AbortSignal.timeout(30_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          cookie: cookieHeader,
          'user-agent': 'LeagueSaga Import Helper/0.1.0'
        },
        signal
      });

      if (response.ok) return response.json();
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await retryDelay(attempt, options.signal);
        continue;
      }
      throw new Error(espnStatusMessage(response.status));
    } catch (error) {
      if (options.signal?.aborted) throw new Error('Import canceled.');
      if (error instanceof Error && error.message.startsWith('ESPN ')) throw error;
      if (attempt < 2) {
        await retryDelay(attempt, options.signal);
        continue;
      }
      if (timeout.aborted) throw new Error('ESPN took too long to respond. Check your connection and try again.');
      throw new Error('Unable to reach ESPN. Check your connection and try again.');
    }
  }
  throw new Error('Unable to reach ESPN.');
}

function espnStatusMessage(status: number): string {
  if (status === 401 || status === 403)
    return 'ESPN sign-in expired or this account cannot access the league. Sign in again and retry.';
  if (status === 404) return 'ESPN could not find that league and season. Confirm both values and retry.';
  if (status === 429) return 'ESPN is temporarily rate limiting imports. Wait a moment and retry.';
  if (status >= 500) return 'ESPN is temporarily unavailable. Try again shortly.';
  return `ESPN rejected the import request (${status}).`;
}

async function retryDelay(attempt: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, 350 * 2 ** attempt);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new Error('Import canceled.'));
      },
      { once: true }
    );
  });
}
