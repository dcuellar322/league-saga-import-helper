import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function manifest({ identityName, publisher, publisherDisplayName, version }) {
  if (!/^[A-Za-z0-9.-]{3,50}$/.test(identityName ?? ''))
    throw new Error('Set MICROSOFT_STORE_IDENTITY_NAME from Product identity.');
  if (!publisher?.startsWith('CN=') || /[\r\n]/.test(publisher))
    throw new Error('Set MICROSOFT_STORE_PUBLISHER from Product identity.');
  if (!publisherDisplayName?.trim())
    throw new Error('Set MICROSOFT_STORE_PUBLISHER_DISPLAY_NAME from Product identity.');
  if (!/^\d+\.\d+\.\d+$/.test(version) || version.split('.').some((n) => Number(n) > 65535))
    throw new Error('MSIX requires three numeric version components, each at most 65535.');
  const [major, minor, patch] = version.split('.').map(Number);
  if (major >= 65535) throw new Error('MSIX major version offset exceeds the Windows limit.');
  // Store forbids major zero and reserves the fourth component. Keep this mapping stable.
  const packageVersion = `${major + 1}.${minor}.${patch}.0`;
  const xml = (value) =>
    value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 IgnorableNamespaces="uap rescap">
 <Identity Name="${xml(identityName)}" Publisher="${xml(publisher)}" Version="${packageVersion}" ProcessorArchitecture="x64" />
 <Properties>
  <DisplayName>LeagueSaga Import Helper</DisplayName>
  <PublisherDisplayName>${xml(publisherDisplayName)}</PublisherDisplayName>
  <Description>Import your ESPN league history into LeagueSaga.</Description>
  <Logo>Assets\\StoreLogo.png</Logo>
 </Properties>
 <Resources><Resource Language="en-US" /></Resources>
 <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
 <Applications>
  <Application Id="Helper" Executable="app\\LeagueSaga Import Helper.exe" EntryPoint="Windows.FullTrustApplication">
   <uap:VisualElements DisplayName="LeagueSaga Import Helper" Description="Import your ESPN league history into LeagueSaga."
    BackgroundColor="#0B1F3A" Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png" />
   <Extensions><uap:Extension Category="windows.protocol"><uap:Protocol Name="leaguesaga-import"><uap:DisplayName>LeagueSaga Import</uap:DisplayName></uap:Protocol></uap:Extension></Extensions>
  </Application>
 </Applications>
 <Capabilities><Capability Name="internetClient" /><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2];
  if (!output) throw new Error('Provide the package staging directory.');
  const pkg = JSON.parse(await readFile(new URL('../apps/desktop/package.json', import.meta.url), 'utf8'));
  await writeFile(
    join(output, 'AppxManifest.xml'),
    manifest({
      identityName: process.env.MICROSOFT_STORE_IDENTITY_NAME,
      publisher: process.env.MICROSOFT_STORE_PUBLISHER,
      publisherDisplayName: process.env.MICROSOFT_STORE_PUBLISHER_DISPLAY_NAME,
      version: pkg.version
    })
  );
}
