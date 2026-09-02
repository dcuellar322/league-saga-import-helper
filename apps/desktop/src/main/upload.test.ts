import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockHistoryImport } from '@leaguesaga/import-contract';

vi.mock('electron', () => ({ app: { isPackaged: false } }));

import { MAX_IMPORT_PACKAGE_BYTES, uploadBundle } from './upload.js';

describe('LeagueSaga uploads', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('accepts a trusted continuation URL from a successful preview', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ continuationUrl: 'http://localhost:15173/imports/preview/1' }), { status: 200 })
        )
    );
    const result = await uploadBundle({
      apiBaseUrl: 'http://localhost:15173',
      importToken: 'one-time-token',
      bundle: createMockHistoryImport()
    });
    expect(result).toMatchObject({
      ok: true,
      code: 'ok',
      retryable: false,
      continuationUrl: 'http://localhost:15173/imports/preview/1'
    });
  });

  it('uploads a multi-season history package atomically', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', request);
    const history = createMockHistoryImport();

    const result = await uploadBundle({
      apiBaseUrl: 'http://localhost:15173',
      importToken: 'one-time-token',
      bundle: history
    });

    expect(result.ok).toBe(true);
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body.kind).toBe('league-history');
    expect(body.seasons).toHaveLength(3);
  });

  it('drops untrusted continuation URLs and classifies expired sessions', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ continuationUrl: 'https://evil.example/steal' }), { status: 403 })
        )
    );
    const result = await uploadBundle({
      apiBaseUrl: 'http://localhost:15173',
      importToken: 'expired-token',
      bundle: createMockHistoryImport()
    });
    expect(result).toMatchObject({ ok: false, code: 'expired', retryable: false });
    expect(result.continuationUrl).toBeUndefined();
  });

  it('returns a privacy-safe offline result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket failed with sensitive internals')));
    const result = await uploadBundle({
      apiBaseUrl: 'http://localhost:15173',
      importToken: 'token',
      bundle: createMockHistoryImport()
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'offline',
      retryable: true,
      message: 'Unable to reach LeagueSaga. Check your connection and retry.'
    });
  });

  it('classifies cancellation separately from connectivity failures', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('aborted')));
    const result = await uploadBundle(
      { apiBaseUrl: 'http://localhost:15173', importToken: 'token', bundle: createMockHistoryImport() },
      controller.signal
    );
    expect(result).toMatchObject({ ok: false, code: 'canceled', retryable: false, message: 'Upload canceled.' });
  });

  it('ignores non-object successful response bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('accepted', { status: 200 })));
    const result = await uploadBundle({
      apiBaseUrl: 'http://localhost:15173',
      importToken: 'token',
      bundle: createMockHistoryImport()
    });
    expect(result).toMatchObject({ ok: true, code: 'ok' });
    expect(result.continuationUrl).toBeUndefined();
  });

  it('rejects an oversized bundle before sending it', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const bundle = createMockHistoryImport();
    bundle.warnings = ['x'.repeat(MAX_IMPORT_PACKAGE_BYTES)];

    const result = await uploadBundle({
      apiBaseUrl: 'http://localhost:15173',
      importToken: 'token',
      bundle
    });

    expect(result).toMatchObject({ ok: false, status: 413, code: 'rejected', retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
