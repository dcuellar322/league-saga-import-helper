import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { z } from 'zod';
import { LeagueSagaHistoryImportSchema, LeagueSagaImportPreviewSchema } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'json-schema');
const publicSchemaDir = join(__dirname, '..', '..', '..', 'schemas');

await mkdir(distDir, { recursive: true });
await mkdir(publicSchemaDir, { recursive: true });

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

async function renderJsonSchema(schema: z.ZodType, name: string) {
  return format(JSON.stringify(toNamedJsonSchema(schema, name)), {
    parser: 'json',
    printWidth: 120
  });
}

const [previewSchema, historySchema] = await Promise.all([
  renderJsonSchema(LeagueSagaImportPreviewSchema, 'LeagueSagaImportPreview'),
  renderJsonSchema(LeagueSagaHistoryImportSchema, 'LeagueSagaHistoryImport')
]);

await Promise.all([
  writeFile(join(distDir, 'leaguesaga-import-preview.schema.json'), previewSchema, 'utf-8'),
  writeFile(join(distDir, 'leaguesaga-history-import.schema.json'), historySchema, 'utf-8'),
  writeFile(join(publicSchemaDir, 'leaguesaga-history-import-v0.2.schema.json'), historySchema, 'utf-8')
]);
