import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import hardenPackagedMetadata from '../../scripts/after-pack.cjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('macOS packaged metadata hardening', () => {
  it('loads the ESM plist dependency and removes unused permission descriptions', async () => {
    const appOutDir = await mkdtemp(join(tmpdir(), 'leaguesaga-after-pack-'));
    temporaryDirectories.push(appOutDir);
    const contentsDirectory = join(appOutDir, 'LeagueSaga Import Helper.app', 'Contents');
    const infoPath = join(contentsDirectory, 'Info.plist');
    await mkdir(contentsDirectory, { recursive: true });
    await writeFile(
      infoPath,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>LeagueSaga Import Helper</string>
<key>NSCameraUsageDescription</key><string>Not used</string>
<key>NSMicrophoneUsageDescription</key><string>Not used</string>
</dict></plist>`,
      'utf-8'
    );

    await hardenPackagedMetadata({
      electronPlatformName: 'darwin',
      appOutDir,
      packager: { appInfo: { productFilename: 'LeagueSaga Import Helper' } }
    });

    const info = await readFile(infoPath, 'utf-8');
    expect(info).not.toContain('NSCameraUsageDescription');
    expect(info).not.toContain('NSMicrophoneUsageDescription');
    expect(info).toContain('<key>NSAppTransportSecurity</key>');
    expect(info).toContain('<key>NSAllowsArbitraryLoads</key>');
    expect(info).toContain('<key>NSAllowsLocalNetworking</key>');
  });

  it('does nothing on non-macOS packages', async () => {
    await expect(
      hardenPackagedMetadata({
        electronPlatformName: 'linux',
        appOutDir: '/does/not/exist',
        packager: { appInfo: { productFilename: 'LeagueSaga Import Helper' } }
      })
    ).resolves.toBeUndefined();
  });
});
