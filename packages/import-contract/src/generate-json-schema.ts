import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  LeagueSagaHistoryImportSchema,
  LeagueSagaImportBundleSchema,
  LeagueSagaImportPreviewSchema
} from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'json-schema');

await mkdir(distDir, { recursive: true });

function toNamedJsonSchema(schema: z.ZodType, name: string) {
  const { $schema, ...definition } = z.toJSONSchema(schema, {
    target: 'draft-07',
    io: 'input',
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema instanceof z.ZodObject) {
        jsonSchema.additionalProperties = false;
      }
    }
  });

  return {
    $ref: `#/definitions/${name}`,
    definitions: {
      [name]: definition
    },
    $schema
  };
}

await writeFile(
  join(distDir, 'leaguesaga-import-bundle.schema.json'),
  JSON.stringify(toNamedJsonSchema(LeagueSagaImportBundleSchema, 'LeagueSagaImportBundle'), null, 2),
  'utf-8'
);

await writeFile(
  join(distDir, 'leaguesaga-import-preview.schema.json'),
  JSON.stringify(toNamedJsonSchema(LeagueSagaImportPreviewSchema, 'LeagueSagaImportPreview'), null, 2),
  'utf-8'
);

await writeFile(
  join(distDir, 'leaguesaga-history-import.schema.json'),
  JSON.stringify(toNamedJsonSchema(LeagueSagaHistoryImportSchema, 'LeagueSagaHistoryImport'), null, 2),
  'utf-8'
);
