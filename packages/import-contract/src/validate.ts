import { LeagueSagaImportBundleSchema, type LeagueSagaImportBundle } from './schema.js';

export function validateImportBundle(input: unknown): LeagueSagaImportBundle {
  return LeagueSagaImportBundleSchema.parse(input);
}

export function safeValidateImportBundle(input: unknown) {
  return LeagueSagaImportBundleSchema.safeParse(input);
}
