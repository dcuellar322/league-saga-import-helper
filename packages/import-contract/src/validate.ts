import {
  LeagueSagaHistoryImportSchema,
  LeagueSagaImportBundleSchema,
  LeagueSagaImportPayloadSchema,
  type LeagueSagaHistoryImport,
  type LeagueSagaImportBundle,
  type LeagueSagaImportPayload
} from './schema.js';

export function validateImportBundle(input: unknown): LeagueSagaImportBundle {
  return LeagueSagaImportBundleSchema.parse(input);
}

export function safeValidateImportBundle(input: unknown) {
  return LeagueSagaImportBundleSchema.safeParse(input);
}

export function validateHistoryImport(input: unknown): LeagueSagaHistoryImport {
  return LeagueSagaHistoryImportSchema.parse(input);
}

export function safeValidateHistoryImport(input: unknown) {
  return LeagueSagaHistoryImportSchema.safeParse(input);
}

export function validateImportPayload(input: unknown): LeagueSagaImportPayload {
  return LeagueSagaImportPayloadSchema.parse(input);
}

export function safeValidateImportPayload(input: unknown) {
  return LeagueSagaImportPayloadSchema.safeParse(input);
}
