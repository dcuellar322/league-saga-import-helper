import { createMockImportBundle, validateImportBundle } from '@leaguesaga/import-contract';

const token = process.env.LEAGUESAGA_SMOKE_TOKEN;
const productionApiBase = 'https://portal.leaguesaga.com';
const apiBase = (process.env.LEAGUESAGA_SMOKE_API_BASE ?? productionApiBase).replace(/\/$/, '');
const importSessionId = process.env.LEAGUESAGA_SMOKE_SESSION_ID;
if (!token || !importSessionId) throw new Error('LEAGUESAGA_SMOKE_TOKEN and LEAGUESAGA_SMOKE_SESSION_ID are required.');
if (apiBase !== productionApiBase) throw new Error(`The production smoke test only permits ${productionApiBase}.`);

const generated = createMockImportBundle();
const leagueExternalId = `smoke-${Date.now()}`;
const bundle = validateImportBundle({
  ...generated,
  metadata: {
    ...generated.metadata,
    source: 'espn',
    importSessionId,
    warnings: ['Automated sanitized production smoke test.']
  },
  league: {
    ...generated.league,
    externalRef: { provider: 'espn', externalId: leagueExternalId },
    name: 'LeagueSaga Release Smoke Test'
  },
  teams: generated.teams.map((team) => ({
    ...team,
    externalRef: { ...team.externalRef, provider: 'espn' },
    leagueExternalId
  })),
  rosterEntries: [],
  matchups: [],
  draftPicks: [],
  transactions: []
});

const response = await fetch(`${apiBase}/api/import-helper/espn/preview`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json', 'x-leaguesaga-import-token': token },
  body: JSON.stringify(bundle),
  signal: AbortSignal.timeout(30_000)
});
if (!response.ok) throw new Error(`Production preview smoke test failed with HTTP ${response.status}.`);
const body = await response.json().catch(() => ({}));
const continuation =
  body && typeof body === 'object' ? (body.continuationUrl ?? body.previewUrl ?? body.url) : undefined;
if (typeof continuation === 'string' && !continuation.startsWith(`${productionApiBase}/`)) {
  throw new Error('Production preview returned an untrusted continuation URL.');
}
console.log(`PRODUCTION_UPLOAD_SMOKE_OK status=${response.status}`);
