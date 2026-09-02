import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { HelperSettings } from '../shared/ipc.js';
import { createSettingsSchema } from './validation.js';
import { defaultLeagueSagaApiBaseUrl } from '../shared/environment.js';

const PersistedSettingsSchema = z.object({
  apiBaseUrl: z.string().optional(),
  provider: z.enum(['espn', 'yahoo', 'sleeper']).default('espn'),
  leagueId: z.string(),
  season: z.number().optional()
});

function defaultSettings(): HelperSettings {
  return {
    apiBaseUrl: process.env.LEAGUESAGA_API_BASE ?? defaultLeagueSagaApiBaseUrl(app.isPackaged),
    importToken: process.env.LEAGUESAGA_IMPORT_TOKEN ?? '',
    importSessionId: undefined,
    provider: 'espn',
    leagueId: ''
  };
}

function settingsSchema() {
  return createSettingsSchema({ allowLocalhost: !app.isPackaged });
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export async function readSettings(): Promise<HelperSettings> {
  try {
    const raw = await readFile(settingsPath(), 'utf-8');
    const persisted = PersistedSettingsSchema.parse(JSON.parse(raw));
    const parsed = settingsSchema().parse({
      ...defaultSettings(),
      ...persisted,
      apiBaseUrl: process.env.LEAGUESAGA_API_BASE ?? defaultLeagueSagaApiBaseUrl(app.isPackaged),
      importToken: process.env.LEAGUESAGA_IMPORT_TOKEN ?? ''
    });
    return parsed;
  } catch {
    return settingsSchema().parse(defaultSettings());
  }
}

export async function saveSettings(settings: HelperSettings): Promise<HelperSettings> {
  const parsed = settingsSchema().parse(settings);
  const path = settingsPath();
  await mkdir(dirname(path), { recursive: true });
  const {
    apiBaseUrl: _apiBaseUrl,
    importToken: _importToken,
    importSessionId: _importSessionId,
    ...persisted
  } = parsed;
  await writeFile(path, JSON.stringify(persisted, null, 2), { encoding: 'utf-8', mode: 0o600 });
  return parsed;
}
