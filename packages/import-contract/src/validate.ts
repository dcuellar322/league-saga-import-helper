import {
  LeagueSagaHistoryImportSchema,
  LeagueSagaHistorySeasonSchema,
  type LeagueSagaHistoryImport,
  type LeagueSagaHistorySeason
} from './schema.js';
import { z } from 'zod';

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|credential|password|secret|token|headers?|espn_?s2|swid)/i;
const SENSITIVE_VALUE_PATTERN = /(?:^|[;\s])(?:espn_s2|swid)\s*=|\bauthorization\s*:\s*bearer\s+\S+/i;

const ImportPayloadSchema = z
  .unknown()
  .superRefine((input, context) => {
    if (containsSensitiveMaterial(input)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Import package contains credential-like material.'
      });
    }
  })
  .pipe(LeagueSagaHistoryImportSchema);

function containsSensitiveMaterial(input: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof input === 'string') return SENSITIVE_VALUE_PATTERN.test(input);
  if (!input || typeof input !== 'object') return false;
  if (seen.has(input)) return false;
  seen.add(input);

  if (Array.isArray(input)) return input.some((value) => containsSensitiveMaterial(value, seen));
  return Object.entries(input).some(
    ([key, value]) => SENSITIVE_KEY_PATTERN.test(key) || containsSensitiveMaterial(value, seen)
  );
}

export function validateHistorySeason(input: unknown): LeagueSagaHistorySeason {
  return LeagueSagaHistorySeasonSchema.parse(input);
}

export function safeValidateHistorySeason(input: unknown) {
  return LeagueSagaHistorySeasonSchema.safeParse(input);
}

export function validateHistoryImport(input: unknown): LeagueSagaHistoryImport {
  return LeagueSagaHistoryImportSchema.parse(input);
}

export function safeValidateHistoryImport(input: unknown) {
  return LeagueSagaHistoryImportSchema.safeParse(input);
}

export function validateImportPayload(input: unknown): LeagueSagaHistoryImport {
  return ImportPayloadSchema.parse(input);
}

export function safeValidateImportPayload(input: unknown) {
  return ImportPayloadSchema.safeParse(input);
}
