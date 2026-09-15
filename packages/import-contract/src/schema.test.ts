import { describe, expect, it } from 'vitest';
import { createMockHistoryImport, createMockHistorySeason } from './fixtures';
import { LeagueSagaHistorySeasonSchema } from './schema';
import {
  safeValidateHistoryImport,
  safeValidateImportPayload,
  safeValidateHistorySeason,
  validateHistoryImport,
  validateHistorySeason,
  validateImportPayload
} from './validate';

describe('LeagueSaga import contract', () => {
  it('validates a compact history season fixture', () => {
    const season = validateHistorySeason(createMockHistorySeason());

    expect(season.season).toBe(2026);
    expect(season.league.name).toBe('LeagueSaga Demo League');
    expect(season.teams).toHaveLength(2);
    expect(season.matchups[0]?.winnerTeamExternalId).toBe('1');
  });

  it('rejects history seasons without a team', () => {
    const result = safeValidateHistorySeason(createMockHistorySeason(2026, { teams: [] }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'History season must contain at least one team.'
      );
    }
  });

  it('rejects dangling references and duplicate IDs within a history season', () => {
    const season = createMockHistorySeason();
    season.teams.push({ ...season.teams[0]! });
    season.rosterEntries[0]!.teamExternalId = 'missing-team';
    season.matchups[0]!.winnerTeamExternalId = 'missing-team';
    season.transactions.push({
      externalId: 'tx-1',
      type: 'add',
      items: [
        {
          type: 'add',
          toTeamExternalId: 'missing-team',
          player: { externalId: '1002', fullName: 'New Player', positions: [] }
        }
      ]
    });

    const result = safeValidateHistorySeason(season);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('Duplicate team external ID 1.');
      expect(messages).toContain('Roster entry references unknown team missing-team.');
      expect(messages).toContain('Matchup winner missing-team is not a participant.');
      expect(messages).toContain('Transaction item references unknown team missing-team.');
    }
  });

  it('rejects inconsistent transaction coverage and invalid player movement', () => {
    const season = createMockHistorySeason();
    season.transactionCoverage = {
      available: false,
      detailLevel: 'player',
      periodsRequested: 2,
      periodsSupported: 3,
      limitations: []
    };
    season.transactions.push({
      externalId: 'tx-1',
      type: 'trade',
      items: [
        {
          type: 'trade',
          fromTeamExternalId: '1',
          toTeamExternalId: '1',
          player: { externalId: '1002', fullName: 'New Player', positions: [] }
        }
      ]
    });

    const result = safeValidateHistorySeason(season);

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('Transaction coverage cannot support more periods than were requested.');
      expect(messages).toContain('Transaction coverage detail level must match availability.');
      expect(messages).toContain('Transaction player movement cannot use the same source and destination team.');
    }
  });

  it('validates an ordered multi-season history package', () => {
    const history = validateHistoryImport(createMockHistoryImport());

    expect(history.seasons.map((bundle) => bundle.season)).toEqual([2024, 2025, 2026]);
    expect(validateImportPayload(history)).toEqual(history);
    expect(LeagueSagaHistorySeasonSchema.parse(history.seasons[0])).toEqual(history.seasons[0]);
    expect(history.seasons[0]?.teams[0]).not.toHaveProperty('leagueExternalId');
    expect(history.seasons[0]?.teams[0]).not.toHaveProperty('externalRef');
  });

  it('preserves the published UTC timestamp precision rules', () => {
    const minutePrecision = createMockHistoryImport();
    minutePrecision.generatedAt = '2026-09-15T12:34Z';
    expect(safeValidateHistoryImport(minutePrecision).success).toBe(true);

    const offsetTimestamp = createMockHistoryImport();
    offsetTimestamp.generatedAt = '2026-09-15T12:34:56-05:00';
    expect(safeValidateHistoryImport(offsetTimestamp).success).toBe(false);
  });

  it('rejects a bare history season as an upload payload', () => {
    expect(() => validateImportPayload(createMockHistorySeason())).toThrow();
  });

  it('rejects credential-like material before unknown fields can be stripped', () => {
    const withCookie = {
      ...createMockHistoryImport(),
      providerMetadata: { espn_s2: 'private-session-value' }
    };
    const withAuthorizationHeader = createMockHistoryImport();
    withAuthorizationHeader.warnings = ['authorization: Bearer private-token'];

    expect(() => validateImportPayload(withCookie)).toThrow('credential-like material');
    expect(safeValidateImportPayload(withAuthorizationHeader).success).toBe(false);
  });

  it('rejects duplicate, unordered, and mismatched history seasons', () => {
    const duplicate = createMockHistoryImport([2025, 2025]);
    const mismatch = createMockHistoryImport([2024, 2025]);
    mismatch.endSeason = 2026;

    const duplicateResult = safeValidateHistoryImport(duplicate);
    const mismatchResult = safeValidateHistoryImport(mismatch);

    expect(duplicateResult.success).toBe(false);
    expect(mismatchResult.success).toBe(false);
  });
});
