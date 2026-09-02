import {
  LeagueSagaHistoryImportSchema,
  LeagueSagaHistorySeasonSchema,
  type LeagueSagaHistoryImport,
  type LeagueSagaHistorySeason
} from './schema.js';

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
  return LeagueSagaHistoryImportSchema.parse(input);
}

export function safeValidateImportPayload(input: unknown) {
  return LeagueSagaHistoryImportSchema.safeParse(input);
}
