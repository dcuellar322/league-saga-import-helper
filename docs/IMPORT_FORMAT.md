# LeagueSaga History Import Format

The LeagueSaga history import format is a public, versioned interchange contract for fantasy
league history. Provider adapters convert their private response shapes into this format before any
league data can leave the helper.

The format is not a provider-response archive and is not a copy of LeagueSaga's database schema.
It contains portable fantasy-football facts, provider external IDs for matching, provenance, data
coverage warnings, and no LeagueSaga database IDs.

## Data flow

```text
Provider response -> provider adapter -> history import JSON -> LeagueSaga import adapter
```

- Provider responses and session credentials remain local.
- The provider adapter owns provider-specific parsing and normalization.
- The history import JSON is the only league-data document the helper can upload.
- LeagueSaga maps this public document into its private canonical and persistence models.

## Current version

| Version | Document                             | Status                        |
| ------- | ------------------------------------ | ----------------------------- |
| `0.2.0` | Compact multi-season history package | First public contract version |

The canonical machine-readable schemas are:

- [`schemas/leaguesaga-history-import-v0.2.schema.json`](../schemas/leaguesaga-history-import-v0.2.schema.json)

LeagueSaga validates the complete document before it previews or stores any imported league data.

## Why version 0.2 is compact

During development, each season was represented as a complete standalone package. A history export
therefore repeated the provider, helper version, import session, league ID, contract version, and
season on many nested records. That unpublished shape was removed before the first public release.

Version 0.2 keeps shared context in the envelope and the season year on its season container.
Nested records retain explicit provider external IDs but do not repeat the provider, league ID, or
season. Player snapshots remain nested in roster, draft, and transaction records. The format does
not merge those snapshots because a player's provider data can differ by season or event.

On a representative ten-season development fixture, the v0.2 structure is about 30% smaller than
the former nested-bundle structure in both pretty-printed and minified JSON. Actual savings depend
on the league and the data categories selected by the user.

## Envelope

| Field                      | Meaning                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `kind`                     | Always `league-history`                                       |
| `contractVersion`          | Exact history-contract version; currently `0.2.0`             |
| `provider`                 | Source provider: `espn`, `yahoo`, `sleeper`, or `mock`        |
| `generatedAt`              | UTC or offset-aware ISO 8601 generation timestamp             |
| `helper`                   | Public generator name, version, and operating-system platform |
| `importSessionId`          | Optional non-secret LeagueSaga upload-session correlation ID  |
| `leagueExternalId`         | Provider's league ID; never a LeagueSaga database ID          |
| `leagueName`               | Latest normalized league name for display                     |
| `startSeason`, `endSeason` | Oldest and newest included season                             |
| `seasons`                  | Ordered, unique season documents                              |
| `warnings`                 | Package-level coverage or availability notices                |

## Season document

Each season contains:

| Field           | Meaning                                                                        |
| --------------- | ------------------------------------------------------------------------------ |
| `season`        | Four-digit fantasy season year                                                 |
| `league`        | Season-specific league name, size, visibility, period, and normalized settings |
| `teams`         | Team identity and owner display information                                    |
| `rosterEntries` | Team-to-player assignments and lineup context                                  |
| `matchups`      | Participants, scores, projections, winner, and playoff classification          |
| `draftPicks`    | Draft order, team, player, keeper, and auction information                     |
| `transactions`  | Normalized transaction events and player/team items                            |
| `warnings`      | Season-specific coverage notices                                               |

League and teams are required. The user can remove rosters, matchups, draft picks, or transactions
before saving or uploading the document.

## Normalized league settings

`league.settings` is allowlisted and provider-neutral. Unknown provider objects are not copied into
the package.

| Group             | Fields                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `schedule`        | `regularSeasonMatchupPeriods`, `playoffTeamCount`, `finalScoringPeriod`                         |
| `roster.slots[]`  | Provider `sourceId`, normalized `name`, and positive `count`                                    |
| `scoring`         | Provider scoring `mode`, normalized PPR `format`, `pointsPerReception`, and `rules[]`           |
| `scoring.rules[]` | Provider `sourceId`, optional display name/abbreviation, point value, and keyed point overrides |

The provider source ID is retained when a setting or entity needs stable source identity. It does
not become a LeagueSaga internal identifier.

## Minimal valid example

```json
{
  "kind": "league-history",
  "contractVersion": "0.2.0",
  "provider": "espn",
  "generatedAt": "2026-09-02T12:00:00Z",
  "helper": {
    "name": "LeagueSaga Import Helper",
    "version": "0.2.0",
    "platform": "darwin"
  },
  "leagueExternalId": "123456",
  "leagueName": "Example League",
  "startSeason": 2026,
  "endSeason": 2026,
  "seasons": [
    {
      "season": 2026,
      "league": {
        "name": "Example League",
        "size": 1,
        "visibility": "private",
        "settings": {
          "schedule": {
            "regularSeasonMatchupPeriods": 14,
            "playoffTeamCount": 6,
            "finalScoringPeriod": 17
          },
          "roster": {
            "slots": [{ "sourceId": "0", "name": "QB", "count": 1 }]
          },
          "scoring": {
            "mode": "H2H_POINTS",
            "format": "ppr",
            "pointsPerReception": 1,
            "rules": [
              {
                "sourceId": "53",
                "name": "Receptions",
                "abbreviation": "REC",
                "points": 1
              }
            ]
          }
        }
      },
      "teams": [
        {
          "externalId": "1",
          "displayName": "Example Team",
          "ownerDisplayNames": ["Example Manager"]
        }
      ],
      "rosterEntries": [],
      "matchups": [],
      "draftPicks": [],
      "transactions": [],
      "warnings": []
    }
  ],
  "warnings": []
}
```

## Privacy boundary

The schema does not permit credentials, cookies, authorization headers, provider response
fragments, arbitrary provider settings, LeagueSaga account data, billing data, database table
names, or LeagueSaga internal IDs. The helper also scans the completed package for sensitive
material before upload.

Owner display names, team names, player information, scores, and league history can still be
personal or private league information. Users must review the package and have authority to import
it.

## Evolution rules

- Provider-specific parsing stays in the provider adapter.
- Shared fields describe fantasy-league facts rather than a provider API or LeagueSaga table.
- New provider-only data must first have a clear normalized meaning. If an extension is necessary,
  it must be namespaced, allowlisted, documented, and versioned.
- Removing, renaming, or changing the meaning of a field requires a new contract version.
- LeagueSaga should accept older supported versions during a coordinated helper rollout.
- Examples and generated JSON Schemas must change in the same pull request as the TypeScript
  contract.
