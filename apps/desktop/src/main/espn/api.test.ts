import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cookies.js', () => ({
  buildEspnCookieHeader: vi.fn().mockResolvedValue('SWID=redacted; espn_s2=redacted')
}));

import { fetchEspnLeaguePayload } from './api.js';

describe('ESPN requests', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns JSON without exposing cookie values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 123 }), { status: 200 })));
    await expect(
      fetchEspnLeaguePayload({ leagueId: '123', season: 2026 }, { helperVersion: '0.3.2' })
    ).resolves.toEqual({ id: 123 });
    const headers = (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.cookie).toContain('redacted');
    expect(headers['user-agent']).toBe('LeagueSaga-Import-Helper/0.3.2');
  });

  it('turns access failures into an actionable sanitized error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('raw upstream account details', { status: 403 })));
    await expect(fetchEspnLeaguePayload({ leagueId: '123', season: 2026 })).rejects.toThrow('ESPN sign-in expired');
    await expect(fetchEspnLeaguePayload({ leagueId: '123', season: 2026 })).rejects.not.toThrow('raw upstream');
  });

  it('recognizes authorization failures encoded in a successful ESPN response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ message: 'You are not authorized to view this League.' }] }), {
          status: 200
        })
      )
    );

    await expect(fetchEspnLeaguePayload({ leagueId: '123', season: 2026 })).rejects.toMatchObject({ code: 'auth' });
  });

  it('checks each ESPN route once when a season is missing', async () => {
    const request = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', request);
    await expect(fetchEspnLeaguePayload({ leagueId: '404', season: 2025 })).rejects.toThrow(
      'could not find that league and season'
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('falls back to the legacy league-history endpoint and unwraps its array response', async () => {
    const legacyLeague = { id: 123, settings: { name: 'Legacy League' }, teams: [{ id: 1 }] };
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([legacyLeague]), { status: 200 }));
    vi.stubGlobal('fetch', request);

    await expect(fetchEspnLeaguePayload({ leagueId: '123', season: 2017 })).resolves.toMatchObject({
      ...legacyLeague,
      __leagueSagaImportHelper: {
        transactionHistoryAvailable: false,
        transactionPeriodsRequested: 0,
        transactionPeriodsSupported: 0
      }
    });
    expect(request).toHaveBeenCalledTimes(2);

    const modernUrl = new URL(String(request.mock.calls[0]?.[0]));
    expect(modernUrl.pathname).toBe('/apis/v3/games/ffl/seasons/2017/segments/0/leagues/123');

    const legacyUrl = new URL(String(request.mock.calls[1]?.[0]));
    expect(legacyUrl.pathname).toBe('/apis/v3/games/ffl/leagueHistory/123');
    expect(legacyUrl.searchParams.get('seasonId')).toBe('2017');
    expect(legacyUrl.searchParams.getAll('view')).toContain('mStandings');
    expect(legacyUrl.searchParams.getAll('view')).not.toContain('mTransactions2');
  });

  it('classifies an empty legacy history response as a missing season', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status: 404 }))
        .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    );

    await expect(fetchEspnLeaguePayload({ leagueId: '123', season: 2010 })).rejects.toMatchObject({
      code: 'not_found'
    });
  });

  it('enriches legacy draft players without requesting unsupported transaction periods', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 123,
              teams: [{ id: 1 }],
              draftDetail: { picks: [{ overallPickNumber: 1, playerId: 99 }] }
            }
          ]),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 99, fullName: 'Legacy Draft Player' }), { status: 200 })
      );
    vi.stubGlobal('fetch', request);

    const payload = (await fetchEspnLeaguePayload({ leagueId: '123', season: 2017 })) as Record<string, unknown>;

    expect(payload.players).toEqual([{ id: 99, fullName: 'Legacy Draft Player' }]);
    expect(
      request.mock.calls.some(([input]) => new URL(String(input)).searchParams.get('view') === 'mTransactions2')
    ).toBe(false);
    expect(new URL(String(request.mock.calls[3]?.[0])).hostname).toBe('sports.core.api.espn.com');
  });

  it('rejects a malformed modern response without trying the legacy endpoint', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', request);

    await expect(fetchEspnLeaguePayload({ leagueId: '123', season: 2026 })).rejects.toMatchObject({
      code: 'rejected'
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('collects every transaction period, deduplicates events, and resolves referenced players', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 123,
            settings: { scheduleSettings: { finalScoringPeriod: 2 } },
            teams: [{ id: 1, roster: { entries: [] } }],
            draftDetail: { picks: [{ overallPickNumber: 1, playerId: 20 }] }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [{ id: 'tx-1', items: [{ type: 'FREEAGENT ADD', toTeamId: 1, playerId: 30 }] }]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              { id: 'tx-1', items: [] },
              { id: 'tx-2', items: [{ type: 'DROP', fromTeamId: 1, playerId: 20 }] }
            ]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            players: [
              { player: { id: 20, fullName: 'Draft Player', defaultPositionId: 1 } },
              { player: { id: 30, fullName: 'Transaction Player', defaultPositionId: 2 } }
            ]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', request);

    const payload = (await fetchEspnLeaguePayload({ leagueId: '123', season: 2025 })) as Record<string, unknown>;

    expect((payload.transactions as Array<{ id: string }>).map((transaction) => transaction.id)).toEqual([
      'tx-1',
      'tx-2'
    ]);
    expect((payload.transactions as Array<{ items: unknown[] }>)[0]?.items).toHaveLength(1);
    expect(payload.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'tx-1', scoringPeriodId: 1 }),
        expect.objectContaining({ id: 'tx-2', scoringPeriodId: 2 })
      ])
    );
    expect(payload.players).toHaveLength(2);
    expect(payload.__leagueSagaImportHelper).toEqual({
      transactionHistoryAvailable: true,
      transactionPeriodsRequested: 2,
      transactionPeriodsSupported: 2
    });
    expect(request).toHaveBeenCalledTimes(4);

    const periodUrls = request.mock.calls.slice(1, 3).map(([input]) => new URL(String(input)));
    expect(periodUrls.map((url) => url.searchParams.get('scoringPeriodId'))).toEqual(['1', '2']);
    expect(periodUrls.every((url) => url.searchParams.get('view') === 'mTransactions2')).toBe(true);
    const lookupHeaders = (request.mock.calls[3]?.[1] as RequestInit).headers as Record<string, string>;
    expect(JSON.parse(lookupHeaders['x-fantasy-filter']!)).toEqual({
      players: { filterIds: { value: [20, 30] } }
    });
  });

  it('uses ESPN athlete data when a draft player is absent from fantasy lookup', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 123,
            settings: { scheduleSettings: { finalScoringPeriod: 1 } },
            teams: [{ id: 1 }],
            draftDetail: { picks: [{ overallPickNumber: 1, playerId: 99 }] }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ transactions: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ players: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 99, fullName: 'Archived Player', position: { displayName: 'Quarterback' } }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', request);

    const payload = (await fetchEspnLeaguePayload({ leagueId: '123', season: 2025 })) as Record<string, unknown>;

    expect(payload.players).toEqual([
      { id: 99, fullName: 'Archived Player', position: { displayName: 'Quarterback' } }
    ]);
    expect(new URL(String(request.mock.calls[3]?.[0])).hostname).toBe('sports.core.api.espn.com');
    const publicHeaders = (request.mock.calls[3]?.[1] as RequestInit).headers as Record<string, string>;
    expect(publicHeaders).not.toHaveProperty('cookie');
  });

  it('records partial transaction-period coverage without discarding the season', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 123,
            settings: { scheduleSettings: { finalScoringPeriod: 2 } },
            teams: [{ id: 1 }]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ transactions: [{ id: 'tx-1', items: [{ type: 'DROP', fromTeamId: 1 }] }] }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', request);

    const payload = (await fetchEspnLeaguePayload({ leagueId: '123', season: 2025 })) as Record<string, unknown>;

    expect(payload.transactions).toHaveLength(1);
    expect(payload.__leagueSagaImportHelper).toMatchObject({
      transactionHistoryAvailable: true,
      transactionPeriodsRequested: 2,
      transactionPeriodsSupported: 1
    });
  });

  it('retries transient ESPN failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status: 503 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: 123 }), { status: 200 }))
    );
    await expect(fetchEspnLeaguePayload({ leagueId: '123', season: 2026 })).resolves.toEqual({ id: 123 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('honors cancellation without leaking request details', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private socket details')));
    await expect(
      fetchEspnLeaguePayload({ leagueId: '123', season: 2026 }, { signal: controller.signal })
    ).rejects.toThrow('Import canceled.');
  });
});
