# Windows VM test package

This bundle is for a disposable Windows 11 x64 VM. It is self-signed for testing, not certified
by Microsoft Store. The unsigned Store submission is kept separately and unchanged.
The public `.cer` is included; the signing private key is never exported and is deleted after building.
The certificate expires after 90 days. Each build has a new test certificate.

## Install in the VM

1. Take a VM snapshot before installing. Download the `windows-vm-test-x64` artifact from the
   **Windows Store package** GitHub Actions run and extract the ZIP inside Windows.
2. In the extracted folder, review `TEST-BUILD.json`. Compare the public certificate thumbprint
   with the build's `VM_TEST_SIGNATURE_OK` log line. `SHA256SUMS.txt` lists file hashes; use
   `Get-FileHash .\LeagueSaga-VM-TEST.cer -Algorithm SHA256` (and the MSIX filename) to compare them.
3. Double-click `LeagueSaga-VM-TEST.cer`, select **Install Certificate**, then **Local Machine**.
   Approve the Windows administrator prompt. Select **Place all certificates in the following store**,
   browse to **Trusted People**, and finish. Do this only inside the test VM, not on your Mac or
   another Windows computer. Do not choose Trusted Root Certification Authorities.
4. Double-click the `LeagueSagaImportHelper-...-VM-TEST-x64.msix` and select **Install**.
   If App Installer is unavailable, open ordinary Windows PowerShell in the extracted directory:

   ```powershell
   Add-AppxPackage -Path (Get-ChildItem .\*-VM-TEST-x64.msix).FullName
   ```

5. Launch **LeagueSaga Import Helper** from Start. No Node.js, source checkout, or SDK is needed.
   Do not disable antivirus, SmartScreen, signature checking, or execution policy to install it.
   If installation fails, record the exact error.

This package uses the real Store identity to exercise the same manifest and app behavior.
Uninstall it before installing a Microsoft Store version; do not attempt an in-place transition
between different signing certificates. Save any desired JSON exports first.

## Verify the application

- Start menu launch and normal close/reopen.
- In Edge, sign into `https://portal.leaguesaga.com`, start an ESPN import, and use **Open Import Helper**.
  Test with the helper closed and already open. Keep full launch links and tokens out of screenshots.
- Sign into ESPN yourself with a league you are authorized to access. Review seasons and data categories.
- Upload the reviewed history to the portal preview. Stop before saving unless you intend to import it.
- Check **Clear ESPN Session** removes the sign-in session.
- Settings should report that Microsoft Store manages updates, with no GitHub installer offered.
  Actual Store installation/update delivery still needs a later Store-distributed test.

## Store screenshots

Capture the real Windows app using Snipping Tool (Win+Shift+S). Save PNGs, preferably at least
1366 x 768 pixels, less than 50 MB each. One is required; four are recommended:

1. Start/import setup with no token visible.
2. League/season selection using non-private example data.
3. History review with non-private example data and data category controls.
4. Settings/session controls.

Do not use fabricated app mockups, login passwords, private member names, raw league data,
import tokens, or full launch URLs. Capture only screens you can safely publish; a clean initial
app screen is sufficient for the minimum screenshot requirement. Upload under Store listing > Desktop.

## Remove test trust

Uninstall the helper in **Settings > Apps > Installed apps**. Then run `certlm.msc` inside the VM,
open **Trusted People > Certificates**, and remove only the certificate whose thumbprint matches
`TEST-BUILD.json`. Restoring the pre-install VM snapshot also removes the app and its test trust.

## Build this bundle

Dispatch **Windows Store package** with `vm_test` checked. Only manual builds can produce it.
The workflow signs a copy with a non-exportable ephemeral code-signing key, verifies its signature
on the disposable runner, and uploads only the MSIX, public certificate, metadata, hashes, and this guide.
No test artifact is attached to a public release or advertised in LeagueSaga's UI.
