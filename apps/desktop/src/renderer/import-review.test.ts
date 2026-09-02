import { describe, expect, it } from 'vitest';
import { createMockHistoryImport, validateHistoryImport } from '@leaguesaga/import-contract';
import { createDeliveryHistory, DEFAULT_INCLUDED_CATEGORIES } from './import-review.js';

describe('renderer import review helpers', () => {
  it('applies review choices to every season in a history import', () => {
    const source = createMockHistoryImport();
    const reviewed = createDeliveryHistory(source, {
      ...DEFAULT_INCLUDED_CATEGORIES,
      rosterEntries: false
    });

    expect(reviewed.seasons.every((bundle) => bundle.rosterEntries.length === 0)).toBe(true);
    expect(reviewed.seasons.every((bundle) => bundle.teams.length > 0)).toBe(true);
    expect(() => validateHistoryImport(reviewed)).not.toThrow();
  });

  it('removes every transaction product when the user excludes transactions', () => {
    const source = createMockHistoryImport([2026]);
    source.seasons[0]!.transactions.push({
      externalId: 'transaction-1',
      type: 'trade',
      items: [
        {
          type: 'trade',
          fromTeamExternalId: '1',
          toTeamExternalId: '2',
          player: { externalId: '1001', fullName: 'Demo Quarterback', positions: ['QB'] }
        }
      ]
    });
    source.seasons[0]!.transactionSummaries.push({
      teamExternalId: '1',
      trades: 1,
      acquisitions: 0,
      drops: 0,
      acquisitionBudgetSpent: 0,
      moveToActive: 0,
      moveToIR: 0,
      paid: 0,
      teamCharges: 0,
      misc: 0,
      matchupAcquisitionTotals: {}
    });
    source.seasons[0]!.tradePartnerSummaries.push({ teamAExternalId: '1', teamBExternalId: '2', trades: 1 });

    const reviewed = createDeliveryHistory(source, { ...DEFAULT_INCLUDED_CATEGORIES, transactions: false });

    expect(reviewed.seasons[0]).toMatchObject({
      transactions: [],
      transactionSummaries: [],
      tradePartnerSummaries: [],
      transactionCoverage: { available: false, detailLevel: 'unavailable' }
    });
    expect(() => validateHistoryImport(reviewed)).not.toThrow();
  });
});
