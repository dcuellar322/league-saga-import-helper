# Microsoft Store release

Cuellar Labs LLC can distribute the helper through the Microsoft Store using its free company
account. Microsoft signs MSIX packages after certification. This path does not need an Azure
signing subscription or a purchased code-signing certificate.

## Account setup: user action

1. Open [Microsoft Store developer registration](https://storedeveloper.microsoft.com/) and choose
   **Company** for Cuellar Labs LLC. Complete business verification and accept Microsoft's developer
   agreement yourself. Have your business email and D-U-N-S number or company documents ready.
2. In Partner Center, create a Windows app and reserve **LeagueSaga Import Helper** (if available).
   Choose the MSIX/packaged-app submission path, rather than an externally hosted EXE/MSI.
3. Open the app's **Product identity** page. Copy these exact public values:
   - Package/Identity/Name
   - Package/Identity/Publisher
   - Package/Properties/PublisherDisplayName
   - Store ID (for the eventual LeagueSaga download link)
4. Supply the three identity values as repository **Actions variables**, not signing secrets:

   | GitHub variable                          | Partner Center value                        |
   | ---------------------------------------- | ------------------------------------------- |
   | `MICROSOFT_STORE_IDENTITY_NAME`          | Package/Identity/Name                       |
   | `MICROSOFT_STORE_PUBLISHER`              | Package/Identity/Publisher, including `CN=` |
   | `MICROSOFT_STORE_PUBLISHER_DISPLAY_NAME` | Package/Properties/PublisherDisplayName     |

The identity must match exactly. Do not substitute a company name for Microsoft's Publisher ID.
Do not share account passwords or recovery codes.

## Build

Dispatch **Windows Store package** from the desired commit. It requires all three identity variables
and uploads `microsoft-store-submission-x64`, containing an unsigned `.msix` and `SHA256SUMS.txt`.
PR and master runs use an explicitly synthetic identity for build verification and do not upload
submission artifacts. They do not require signing credentials or change the public GitHub release.

On Windows with PowerShell 7, Node.js 22+, and the Windows SDK:

```powershell
npm ci
# Set the three MICROSOFT_STORE_* environment values from Product identity first.
npm run make:msix
```

The script uses the existing Electron Builder configuration to package the app with its fuses,
then Microsoft MakeAppx to validate and produce a real MSIX. It generates Store logos from the
existing app artwork. It does not sign the package, install it, or change certificate trust.
The Store-managed app blocks GitHub update checks, downloads, and replacement installers.
Windows registers `leaguesaga-import://` through the package manifest.

Initial target: Windows x64, Windows 10 build 19041 or newer (including Windows 11).
ARM64 is not a native target yet. The manifest declares `internetClient` and `runFullTrust`;
no camera, microphone, background startup, or private-network capability is requested.

The Store package version is `<app major + 1>.<minor>.<patch>.0`. For example, app `0.3.2` maps to
package `1.3.2.0`, and app `1.0.0` maps to package `2.0.0.0`. This stable mapping avoids Microsoft's
prohibition on major zero and leaves the fourth component reserved for the Store. App and import
contract versions remain independent. Each submission with changed binaries needs a new app version.

## Local Windows VM testing

For a disposable Windows VM, dispatch the workflow with `vm_test` enabled. It also produces a
separate `windows-vm-test-x64` artifact. Follow [Windows VM testing](WINDOWS_VM_TEST.md) to install
the public test certificate and signed MSIX. The signing key is not exported. This does not replace
Microsoft Store certification or Store installation/update verification.

## Submission and verification

Upload the `.msix` to Partner Center, complete the listing, privacy policy, support information,
pricing (Free), availability, age ratings, and certification notes. Microsoft still reviews the app;
a successful build does not guarantee acceptance. A packaged Electron desktop app needs the
`runFullTrust` capability. Explain that it hosts an isolated ESPN sign-in session, reads authorized
league history, lets the user review it, and uploads only normalized records to LeagueSaga.

Use a private test distribution/flight before public availability. You will need a Windows test
computer and a legitimate ESPN account/league for live verification. Do not send us your password.
Verify:

- Installation through the Store, Start menu launch, and app identity.
- Portal launch links with the helper closed and already open.
- Live ESPN sign-in, history review, production preview upload, and Clear ESPN session.
- Settings says Microsoft Store manages updates; GitHub installer controls cannot run.
- Updates through the Store retain settings; uninstall/reinstall behaves as expected.
- Windows App Certification Kit results and any Microsoft review feedback.

CI validates the MSIX manifest and package with MakeAppx and launches the unpacked production
Windows renderer with a synthetic deep link. This does **not** verify deployment inside the MSIX
container, Store update delivery, WACK certification, or live ESPN sign-in on Windows.
The unsigned submission artifact is for Partner Center; it is not an end-user download.
After the listing is approved, link `https://apps.microsoft.com/detail/<Store ID>` from LeagueSaga.
Do not advertise a Store link until the listing is available to its intended audience.

## References

- [Free company registration](https://blogs.windows.com/windowsdeveloper/2026/05/07/publish-to-microsoft-store-as-a-company-now-with-free-registration-and-faster-onboarding/)
- [Product identity](https://learn.microsoft.com/en-us/windows/apps/publish/view-app-identity-details)
- [Package and version requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)
- [MakeAppx](https://learn.microsoft.com/en-us/windows/msix/package/create-app-package-with-makeappx-tool)
