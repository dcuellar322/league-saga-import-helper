import { readFile } from 'node:fs/promises';

const tag = (process.argv[2] ?? process.env.GITHUB_REF_NAME ?? '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(tag)) throw new Error('Provide a semantic release tag such as v0.3.0.');

const rootPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf-8'));
const desktopPackage = JSON.parse(await readFile(new URL('../apps/desktop/package.json', import.meta.url), 'utf-8'));
const contractPackage = JSON.parse(
  await readFile(new URL('../packages/import-contract/package.json', import.meta.url), 'utf-8')
);
const contractVersionSource = await readFile(
  new URL('../packages/import-contract/src/version.ts', import.meta.url),
  'utf-8'
);
const sourceVersion = contractVersionSource.match(/IMPORT_CONTRACT_VERSION\s*=\s*'([^']+)'/)?.[1];

const versions = {
  root: rootPackage.version,
  desktop: desktopPackage.version,
  contractPackage: contractPackage.version,
  contractSource: sourceVersion
};
const mismatches = Object.entries(versions).filter(([, version]) => version !== tag);
if (mismatches.length) {
  throw new Error(
    `Release tag ${tag} does not match: ${mismatches.map(([name, version]) => `${name}=${version}`).join(', ')}`
  );
}
console.log(`Release versions match ${tag}.`);
