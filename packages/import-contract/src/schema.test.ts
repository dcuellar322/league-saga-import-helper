import { describe, expect, it } from 'vitest';
import { createMockImportBundle } from './fixtures';
import { safeValidateImportBundle, validateImportBundle } from './validate';

describe('LeagueSaga import contract', () => {
  it('validates the bundled mock import fixture', () => {
    const bundle = validateImportBundle(createMockImportBundle());

    expect(bundle.metadata.source).toBe('mock');
    expect(bundle.league.name).toBe('LeagueSaga Demo League');
    expect(bundle.teams).toHaveLength(2);
    expect(bundle.matchups[0]?.winnerTeamExternalId).toBe('1');
  });

  it('rejects teams that point at a different league', () => {
    const bundle = createMockImportBundle({
      teams: [
        {
          externalRef: { provider: 'mock', externalId: 'rogue-team' },
          leagueExternalId: 'some-other-league',
          displayName: 'Rogue Team',
          ownerDisplayNames: []
        }
      ]
    });

    const result = safeValidateImportBundle(bundle);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'Team rogue-team belongs to a different leagueExternalId.'
      );
    }
  });

  it('rejects bundles without a team', () => {
    const result = safeValidateImportBundle(createMockImportBundle({ teams: [] }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'Import bundle must contain at least one team.'
      );
    }
  });

  it('rejects dangling references, duplicate IDs, and inconsistent seasons', () => {
    const bundle = createMockImportBundle();
    bundle.teams.push({ ...bundle.teams[0]! });
    bundle.rosterEntries[0]!.teamExternalId = 'missing-team';
    bundle.matchups[0]!.season = 2025;
    bundle.matchups[0]!.winnerTeamExternalId = 'missing-team';
    bundle.transactions.push({
      externalRef: { provider: 'mock', externalId: 'tx-1' },
      leagueExternalId: bundle.league.externalRef.externalId,
      season: bundle.league.season,
      items: [{ type: 'add', teamExternalId: 'missing-team' }]
    });

    const result = safeValidateImportBundle(bundle);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('Duplicate team external ID 1.');
      expect(messages).toContain('Roster entry references unknown team missing-team.');
      expect(messages).toContain('Matchup mock-week-1 belongs to a different season.');
      expect(messages).toContain('Matchup winner missing-team is not a matchup participant.');
      expect(messages).toContain('Transaction item references unknown team missing-team.');
    }
  });
});
