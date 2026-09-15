import { describe, expect, it, vi } from 'vitest';
import { createMockHistorySeason } from '@leaguesaga/import-contract';
import { EspnApiError } from './api.js';
import { discoverEspnSeasonYears, importEspnHistory, inclusiveSeasonRange } from './history.js';

const transformSeason = (_payload: unknown, context: { season: number }) => createMockHistorySeason(context.season);

describe('ESPN history imports', () => {
  it('discovers linked seasons from common ESPN response locations', () => {
    expect(
      discoverEspnSeasonYears(
        { status: { previousSeasons: [2023, '2024'] }, settings: { previousSeasons: [{ seasonId: 2022 }] } },
        2025
      )
    ).toEqual([2022, 2023, 2024, 2025]);
  });

  it('builds an inclusive start-year range', () => {
    expect(inclusiveSeasonRange(2023, 2026)).toEqual([2023, 2024, 2025, 2026]);
    expect(inclusiveSeasonRange(2027, 2026)).toEqual([]);
  });

  it('imports every linked season when no start year is supplied', async () => {
    const fetchSeason = vi.fn(async ({ season }: { season: number }, _options: { helperVersion?: string } = {}) =>
      season === 2026 ? { status: { previousSeasons: [2024, 2025] } } : { season }
    );

    const history = await importEspnHistory(
      { leagueId: '123' },
      { currentSeason: 2026, helperVersion: '0.3.0', platform: 'test' },
      { fetchSeason, transformSeason }
    );

    expect(history.seasons.map((bundle) => bundle.season)).toEqual([2024, 2025, 2026]);
    expect(fetchSeason.mock.calls.map(([params]) => params.season)).toEqual([2026, 2024, 2025]);
    expect(fetchSeason.mock.calls.every(([, options]) => options?.helperVersion === '0.3.0')).toBe(true);
  });

  it('imports from the selected start year and skips missing seasons', async () => {
    const fetchSeason = vi.fn(async ({ season }: { season: number }) => {
      if (season === 2025) throw new EspnApiError('not_found', 'missing');
      return { season };
    });

    const history = await importEspnHistory(
      { leagueId: '123', startYear: 2024 },
      { currentSeason: 2026, helperVersion: '0.3.0', platform: 'test' },
      { fetchSeason, transformSeason }
    );

    expect(history.seasons.map((bundle) => bundle.season)).toEqual([2024, 2026]);
    expect(history.warnings).toContain('ESPN season 2025 was not available and was skipped.');
  });

  it('rejects a future start year', async () => {
    await expect(
      importEspnHistory(
        { leagueId: '123', startYear: 2027 },
        { currentSeason: 2026, helperVersion: '0.3.0', platform: 'test' },
        { fetchSeason: vi.fn(), transformSeason }
      )
    ).rejects.toThrow('cannot be later');
  });
});
