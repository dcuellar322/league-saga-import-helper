import { IMPORT_CONTRACT_VERSION } from './version.js';
import type { LeagueSagaHistoryImport, LeagueSagaImportBundle } from './schema.js';

export function createMockImportBundle(overrides: Partial<LeagueSagaImportBundle> = {}): LeagueSagaImportBundle {
  const now = new Date().toISOString();
  const leagueExternalId = 'mock-league-2026';
  const bundle: LeagueSagaImportBundle = {
    metadata: {
      contractVersion: IMPORT_CONTRACT_VERSION,
      source: 'mock',
      generatedAt: now,
      helper: {
        name: 'LeagueSaga Import Helper',
        version: '0.1.0',
        platform: 'mock'
      },
      warnings: ['Mock import bundle for local development.']
    },
    league: {
      externalRef: { provider: 'mock', externalId: leagueExternalId },
      name: 'LeagueSaga Demo League',
      season: 2026,
      size: 2,
      visibility: 'private',
      settings: { scoring: 'PPR' }
    },
    teams: [
      {
        externalRef: { provider: 'mock', externalId: '1' },
        leagueExternalId,
        abbreviation: 'SK',
        location: 'League',
        nickname: 'Keepers',
        displayName: 'Saga Keepers',
        ownerDisplayNames: ['Demo Commissioner']
      },
      {
        externalRef: { provider: 'mock', externalId: '2' },
        leagueExternalId,
        abbreviation: 'TD',
        location: 'Touchdown',
        nickname: 'Archivists',
        displayName: 'Touchdown Archivists',
        ownerDisplayNames: ['Demo Rival']
      }
    ],
    rosterEntries: [
      {
        teamExternalId: '1',
        lineupSlot: 'QB',
        player: {
          externalRef: { provider: 'mock', externalId: '1001' },
          fullName: 'Demo Quarterback',
          positions: ['QB'],
          proTeam: 'FA'
        }
      }
    ],
    matchups: [
      {
        externalRef: { provider: 'mock', externalId: 'mock-week-1' },
        leagueExternalId,
        season: 2026,
        scoringPeriodId: 1,
        home: { teamExternalId: '1', score: 124.4, winner: true },
        away: { teamExternalId: '2', score: 118.2, winner: false },
        winnerTeamExternalId: '1'
      }
    ],
    draftPicks: [],
    transactions: []
  };

  return { ...bundle, ...overrides };
}

export function createMockHistoryImport(
  seasonYears = [2024, 2025, 2026],
  options: {
    leagueExternalId?: string;
    importSessionId?: string;
    helperVersion?: string;
    platform?: string;
  } = {}
): LeagueSagaHistoryImport {
  const leagueExternalId = options.leagueExternalId ?? 'mock-league-history';
  const seasons = seasonYears.map((season) => {
    const bundle = createMockImportBundle();
    return {
      ...bundle,
      metadata: {
        ...bundle.metadata,
        generatedAt: new Date().toISOString(),
        importSessionId: options.importSessionId,
        helper: {
          ...bundle.metadata.helper,
          version: options.helperVersion ?? bundle.metadata.helper.version,
          platform: options.platform ?? bundle.metadata.helper.platform
        }
      },
      league: {
        ...bundle.league,
        externalRef: { ...bundle.league.externalRef, externalId: leagueExternalId },
        season
      },
      teams: bundle.teams.map((team) => ({ ...team, leagueExternalId })),
      matchups: bundle.matchups.map((matchup) => ({
        ...matchup,
        externalRef: { ...matchup.externalRef, externalId: `${season}-${matchup.externalRef.externalId}` },
        leagueExternalId,
        season
      }))
    };
  });

  return {
    kind: 'league-history',
    contractVersion: IMPORT_CONTRACT_VERSION,
    provider: 'mock',
    generatedAt: new Date().toISOString(),
    importSessionId: options.importSessionId,
    leagueExternalId,
    leagueName: 'LeagueSaga Demo League',
    startSeason: seasonYears[0]!,
    endSeason: seasonYears.at(-1)!,
    seasons,
    warnings: ['Mock historical import for local development.']
  };
}
