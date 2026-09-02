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
});
