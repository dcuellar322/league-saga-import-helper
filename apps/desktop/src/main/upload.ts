import { app } from 'electron';
import { validateImportPayload } from '@leaguesaga/import-contract';
import type { UploadParams, UploadResult } from '../shared/ipc.js';
import { createUploadParamsSchema, normalizeLeagueSagaNavigationUrl } from './validation.js';

export const MAX_IMPORT_PACKAGE_BYTES = 32 * 1024 * 1024;

export async function uploadBundle(params: UploadParams, signal?: AbortSignal): Promise<UploadResult> {
  const parsedParams = createUploadParamsSchema({ allowLocalhost: !app.isPackaged }).parse(params);
  const bundle = validateImportPayload(parsedParams.bundle);
  const baseUrl = parsedParams.apiBaseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/api/import-helper/espn/preview`;
  const requestBody = JSON.stringify(bundle);
  if (new TextEncoder().encode(requestBody).byteLength > MAX_IMPORT_PACKAGE_BYTES) {
    return {
      ok: false,
      status: 413,
      code: 'rejected',
      message: `Import package exceeds the ${MAX_IMPORT_PACKAGE_BYTES / 1024 / 1024} MiB upload limit.`,
      retryable: false
    };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-leaguesaga-import-token': parsedParams.importToken
      },
      body: requestBody,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000)
    });

    const bodyText = (await response.text()).slice(0, 100_000);
    let parsed: unknown = bodyText;
    try {
      parsed = bodyText ? JSON.parse(bodyText) : undefined;
    } catch {
      // keep text
    }

    const continuationUrl = response.ok ? findContinuationUrl(parsed, !app.isPackaged) : undefined;
    return {
      ok: response.ok,
      status: response.status,
      code: response.ok
        ? 'ok'
        : response.status === 401
          ? 'unauthorized'
          : response.status === 403
            ? 'expired'
            : response.status >= 500
              ? 'unavailable'
              : 'rejected',
      message: response.ok ? 'Bundle uploaded for LeagueSaga preview.' : `LeagueSaga returned ${response.status}.`,
      retryable: response.status === 429 || response.status >= 500,
      continuationUrl,
      response: response.ok ? parsed : undefined
    };
  } catch (error) {
    const canceled = signal?.aborted ?? false;
    const timeout =
      error instanceof Error && (error.name === 'TimeoutError' || error.message.toLowerCase().includes('timeout'));
    return {
      ok: false,
      status: 0,
      code: canceled ? 'canceled' : timeout ? 'timeout' : 'offline',
      message: canceled
        ? 'Upload canceled.'
        : timeout
          ? 'LeagueSaga took too long to respond.'
          : 'Unable to reach LeagueSaga. Check your connection and retry.',
      retryable: !canceled
    };
  }
}

function findContinuationUrl(response: unknown, allowLocalhost: boolean): string | undefined {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return undefined;
  const record = response as Record<string, unknown>;
  const candidate = record.continuationUrl ?? record.previewUrl ?? record.url;
  if (typeof candidate !== 'string') return undefined;
  try {
    return normalizeLeagueSagaNavigationUrl(candidate, { allowLocalhost });
  } catch {
    return undefined;
  }
}
