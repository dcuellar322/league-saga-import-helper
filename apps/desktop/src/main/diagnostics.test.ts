import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let userData = '';
vi.mock('electron', () => ({ app: { getPath: () => userData } }));

import { exportDiagnostics, recordDiagnostic } from './diagnostics.js';

describe('privacy-safe diagnostics', () => {
  beforeEach(async () => {
    userData = await mkdtemp(join(tmpdir(), 'leaguesaga-diagnostics-'));
  });
  afterEach(async () => {
    await rm(userData, { recursive: true, force: true });
  });

  it('drops sensitive fields and exports only the local event log', async () => {
    await recordDiagnostic('import_finished', {
      teams: 10,
      importToken: 'never-write-this',
      cookieHeader: 'never-write-this-either'
    });
    const destination = join(userData, 'export.jsonl');
    await exportDiagnostics(destination);
    const contents = await readFile(destination, 'utf-8');
    expect(contents).toContain('import_finished');
    expect(contents).toContain('"teams":10');
    expect(contents).not.toContain('never-write-this');
  });
});
