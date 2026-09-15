import assert from 'node:assert/strict';
import { test } from 'node:test';
import { manifest } from './prepare-msix.mjs';

const identity = {
  identityName: '12345.CuellarLabsHelper',
  publisher: 'CN=12345678-1234-1234-1234-123456789012',
  publisherDisplayName: 'Cuellar Labs LLC',
  version: '0.3.2'
};
test('MSIX keeps the Store identity, protocol and restricted capability with a Store-compatible version', () => {
  const xml = manifest(identity);
  assert.ok(xml.includes(`Name="${identity.identityName}"`));
  assert.ok(xml.includes(`Publisher="${identity.publisher}"`));
  assert.ok(xml.includes('Version="1.3.2.0" ProcessorArchitecture="x64"'));
  assert.ok(xml.includes('Name="leaguesaga-import"'));
  assert.ok(xml.includes('Name="runFullTrust"'));
  assert.ok(xml.includes('Executable="app\\LeagueSaga Import Helper.exe"'));
});
test('MSIX fails closed for missing identity and versions Windows cannot package', () => {
  for (const invalid of [
    { identityName: '' },
    { identityName: 'invalid/name' },
    { publisher: '' },
    { publisherDisplayName: '' },
    { version: '0.3.2-beta' },
    { version: '0.3.65536' }
  ]) {
    assert.throws(() => manifest({ ...identity, ...invalid }));
  }
});
test('publisher text cannot inject manifest XML', () => {
  const xml = manifest({ ...identity, publisher: 'CN=Name & "Company"', publisherDisplayName: '<Company>' });
  assert.ok(xml.includes('CN=Name &amp; &quot;Company&quot;'));
  assert.ok(xml.includes('&lt;Company&gt;'));
});

test('Store versions increase when the app moves from pre-1.0 to 1.0', () => {
  assert.ok(manifest({ ...identity, version: '1.0.0' }).includes('Version="2.0.0.0"'));
  assert.throws(() => manifest({ ...identity, version: '65535.0.0' }));
});
