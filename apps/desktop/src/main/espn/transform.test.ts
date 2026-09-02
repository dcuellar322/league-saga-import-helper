import { describe, expect, it } from 'vitest';
import { transformEspnPayload } from './transform.js';
import { sanitizedPrivateLeaguePayload } from './fixtures/sanitized-private-league.js';

const context = {
  leagueId: '123456',
  season: 2026,
  importSessionId: 'session-1',
  helperVersion: '0.1.0-test',
  platform: 'test'
};

describe('ESPN payload transform', () => {
  it('normalizes a sanitized private-league response fixture', () => {
    const bundle = transformEspnPayload(sanitizedPrivateLeaguePayload, { ...context, leagueId: '24681012' });
    expect(bundle.league).toMatchObject({ name: 'Sanitized Fixture League', visibility: 'private', size: 2 });
    expect(bundle.teams.map((team) => team.ownerDisplayNames[0])).toEqual(['Commissioner Example', 'Manager Example']);
    expect(bundle.matchups[0]?.winnerTeamExternalId).toBe('2');
    expect(bundle.draftPicks[0]?.player?.fullName).toBe('Fixture Quarterback');
    expect(bundle.transactions[0]?.items[0]?.player?.fullName).toBe('Sample Running Back');
  });
  it('normalizes league, team, roster, schedule, draft, and transaction data', () => {
    const bundle = transformEspnPayload(
      {
        id: 123456,
        scoringPeriodId: 4,
        settings: {
          name: 'Circle League',
          size: 0,
          isPublic: false,
          scoringSettings: { scoringType: 'H2H_POINTS' },
          cookieToken: 'do-not-keep',
          nested: { authorizationSecret: 'also-remove', harmless: true }
        },
        members: [{ id: 'Commissioner', displayName: 'Demo Commissioner' }],
        teams: [
          {
            id: 1,
            abbrev: 'SK',
            location: 'Saga',
            nickname: 'Keepers',
            owners: ['Commissioner'],
            logo: 'https://cdn.example.com/logo.png',
            playoffSeed: 0,
            finalStanding: '1',
            roster: {
              entries: [
                {
                  lineupSlotId: 0,
                  acquisitionType: 'DRAFT',
                  acquisitionDate: 1767225600000,
                  playerPoolEntry: {
                    injuryStatus: 'ACTIVE',
                    player: {
                      id: 1001,
                      firstName: 'Demo',
                      lastName: 'Quarterback',
                      defaultPositionId: 1,
                      eligibleSlots: [0, 20],
                      proTeamId: 12,
                      jersey: 9
                    }
                  }
                }
              ]
            }
          },
          {
            id: 2,
            location: 'Rival',
            nickname: 'Managers',
            owners: []
          }
        ],
        schedule: [
          {
            id: 77,
            matchupPeriodId: 1,
            winner: 'HOME',
            home: { teamId: 1, totalPoints: 120.5 },
            away: { teamId: 2, totalPoints: 111.2 },
            playoffTierType: 'NONE'
          }
        ],
        draftDetail: {
          picks: [
            {
              overallPickNumber: 0,
              pickNumber: '1',
              roundId: '1',
              roundPickNumber: '1',
              teamId: 1,
              bidAmount: 12,
              playerId: 1001
            }
          ]
        },
        transactions: [
          {
            id: 'tx-1',
            type: 'FREEAGENT ADD',
            proposedDate: 1767225600,
            status: 'EXECUTED',
            items: [{ type: 'FREEAGENT ADD', toTeamId: 1, playerId: 1001 }]
          }
        ]
      },
      context
    );

    expect(bundle.league).toMatchObject({
      name: 'Circle League',
      season: 2026,
      size: 2,
      scoringPeriodId: 4,
      scoringType: 'H2H_POINTS',
      visibility: 'private'
    });
    expect(bundle.league.settings).not.toHaveProperty('cookieToken');
    expect(bundle.league.settings.nested).toEqual({ harmless: true });
    expect(bundle.teams[0]).toMatchObject({
      externalRef: { provider: 'espn', externalId: '1', rawKind: 'team' },
      displayName: 'Saga Keepers',
      ownerDisplayNames: ['Demo Commissioner'],
      finalStanding: 1
    });
    expect(bundle.teams[0]?.playoffSeed).toBeUndefined();
    expect(bundle.rosterEntries[0]?.player.fullName).toBe('Demo Quarterback');
    expect(bundle.rosterEntries[0]).toMatchObject({ lineupSlot: 'QB', player: { positions: ['QB'] } });
    expect(bundle.matchups[0]?.winnerTeamExternalId).toBe('1');
    expect(bundle.draftPicks[0]).toMatchObject({
      overallPick: 1,
      round: 1,
      roundPick: 1,
      player: { fullName: 'Demo Quarterback' }
    });
    expect(bundle.transactions[0]?.items[0]?.type).toBe('add');
    expect(bundle.transactions[0]?.items[0]?.player?.fullName).toBe('Demo Quarterback');
  });

  it('rejects ESPN responses that contain no usable teams', () => {
    expect(() => transformEspnPayload({ settings: { name: '' }, teams: [], schedule: [] }, context)).toThrow(
      'ESPN returned no teams.'
    );
  });

  it('handles optional ESPN shapes and transaction classifications', () => {
    const bundle = transformEspnPayload(
      {
        name: 'Fallback Name',
        settings: {
          size: '10',
          isPublic: true,
          harmless: 'kept',
          tokenSecret: 'removed',
          omitted: undefined
        },
        teams: [
          {
            teamId: '10',
            name: 'Named Team',
            logo: 'not-a-url',
            roster: {
              entries: [
                {
                  player: {
                    playerId: '9001',
                    fullName: 'Direct Player',
                    injuryStatus: 'QUESTIONABLE',
                    status: 'ACTIVE'
                  }
                },
                {
                  playerPoolEntry: { player: {} }
                }
              ]
            }
          },
          { teamId: '11', name: 'Away Team' }
        ],
        schedule: [
          {
            matchupPeriodId: '2',
            home: { teamId: '10', totalProjectedPointsLive: '88.5', winner: false },
            away: { teamId: '11', winner: true }
          },
          {
            matchupPeriodId: 0,
            home: { teamId: '10' }
          }
        ],
        draftDetail: {
          picks: [
            { roundId: 0, roundPickNumber: -1 },
            { playerPoolEntry: { player: { playerId: '7001', fullName: 'Player Only Pick' } }, keeper: true }
          ]
        },
        transactions: [
          { transactionId: 1, processDate: '1767225600000', items: [{ type: 'DROP', fromTeamId: '10' }] },
          { transactionId: 2, date: 'invalid', items: [{ type: 'TRADE', toTeamId: '10' }] },
          { transactionId: 3, items: [{ type: 'DRAFT' }] },
          { transactionId: 4, items: [{ type: 'WAIVER' }] },
          { transactionId: 5, items: [{ type: 'FREE' }] },
          { transactionId: 6, items: [{ type: 'UNKNOWN' }] },
          { items: [{ type: 'ADD' }] }
        ]
      },
      context
    );

    expect(bundle.league).toMatchObject({
      name: 'Fallback Name',
      size: 2,
      visibility: 'public',
      settings: { harmless: 'kept' }
    });
    expect(bundle.league.settings).not.toHaveProperty('tokenSecret');
    expect(bundle.teams[0]).toMatchObject({ externalRef: { externalId: '10' }, displayName: 'Named Team' });
    expect(bundle.teams[0]?.logoUrl).toBeUndefined();
    expect(bundle.rosterEntries).toHaveLength(1);
    expect(bundle.matchups).toHaveLength(1);
    expect(bundle.matchups[0]).toMatchObject({
      externalRef: { externalId: '2026-2-10-11' },
      winnerTeamExternalId: '11',
      home: { projectedScore: 88.5 }
    });
    expect(bundle.draftPicks).toHaveLength(1);
    expect(bundle.draftPicks[0]).toMatchObject({ keeper: true, player: { fullName: 'Player Only Pick' } });
    expect(bundle.transactions.map((transaction) => transaction.items[0]?.type)).toEqual([
      'drop',
      'trade',
      'draft',
      'waiver',
      'free_agent',
      'unknown'
    ]);
    expect(bundle.transactions[1]?.occurredAt).toBeUndefined();
  });

  it('preserves unresolved transaction player IDs and warns the user', () => {
    const bundle = transformEspnPayload(
      {
        settings: { name: 'Player Lookup League' },
        teams: [{ id: 1, name: 'Known Team' }],
        transactions: [{ id: 99, items: [{ type: 'DROP', fromTeamId: 1, playerId: 777 }] }]
      },
      context
    );
    expect(bundle.transactions[0]?.items[0]?.player).toMatchObject({
      fullName: 'ESPN Player 777',
      externalRef: { externalId: '777' }
    });
    expect(bundle.metadata.warnings).toContain(
      '1 draft or transaction player names were unavailable; ESPN player IDs were preserved for matching.'
    );
  });
});
