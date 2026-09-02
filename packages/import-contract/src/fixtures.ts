import { IMPORT_CONTRACT_VERSION } from './version.js';
import type { LeagueSagaHistoryImport, LeagueSagaHistorySeason } from './schema.js';

export function createMockHistorySeason(
  season = 2026,
  overrides: Partial<LeagueSagaHistorySeason> = {}
): LeagueSagaHistorySeason {
  const historySeason: LeagueSagaHistorySeason = {
    season,
    league: {
      name: 'LeagueSaga Demo League',
      size: 2,
      visibility: 'private',
      settings: {
        scoring: {
          mode: 'H2H_POINTS',
          format: 'ppr',
          pointsPerReception: 1,
          rules: [{ sourceId: '53', name: 'Receptions', abbreviation: 'REC', points: 1 }]
        }
      }
    },
    teams: [
      {
        externalId: '1',
        abbreviation: 'SK',
        location: 'League',
        nickname: 'Keepers',
        displayName: 'Saga Keepers',
        ownerDisplayNames: ['Demo Commissioner']
      },
      {
        externalId: '2',
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
          externalId: '1001',
          fullName: 'Demo Quarterback',
          positions: ['QB'],
          proTeam: 'FA'
        }
      }
    ],
    matchups: [
      {
        externalId: `${season}-mock-week-1`,
        scoringPeriodId: 1,
        home: { teamExternalId: '1', score: 124.4, winner: true },
        away: { teamExternalId: '2', score: 118.2, winner: false },
        winnerTeamExternalId: '1'
      }
    ],
    draftPicks: [],
    transactions: [],
    warnings: ['Mock history season for local development.']
  };

  return { ...historySeason, ...overrides };
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
  const seasons = seasonYears.map((season) => createMockHistorySeason(season));

  return {
    kind: 'league-history',
    contractVersion: IMPORT_CONTRACT_VERSION,
    provider: 'mock',
    generatedAt: new Date().toISOString(),
    helper: {
      name: 'LeagueSaga Import Helper',
      version: options.helperVersion ?? '0.2.0',
      platform: options.platform ?? 'mock'
    },
    importSessionId: options.importSessionId,
    leagueExternalId,
    leagueName: 'LeagueSaga Demo League',
    startSeason: seasonYears[0]!,
    endSeason: seasonYears.at(-1)!,
    seasons,
    warnings: ['Mock historical import for local development.']
  };
}
