# Open-Source Boundary

LeagueSaga Import Helper is designed to be safe to publish as a standalone MIT-licensed client and
public integration contract. Its source explains what the helper does on a user's computer and
what it can send. It does not need LeagueSaga server source to build, test, inspect, or package.

## What this repository intentionally exposes

- The desktop user experience and local provider-fetch behavior.
- The public deep-link parameters used to start an import.
- The public upload endpoint path and versioned JSON contract.
- Client-side origin restrictions, validation, diagnostics, and update behavior.
- Synthetic and sanitized test fixtures.

These are public integration surfaces. Publishing them allows users and reviewers to verify the
helper's privacy claims.

## What this repository does not contain

- LeagueSaga database models, table layouts, migrations, or internal IDs.
- LeagueSaga's canonical persistence model or data-access code.
- Account, billing, plan-enforcement, analytics, or authorization implementation.
- Production credentials, provider cookies, signing certificates, API keys, or release secrets.
- Raw provider responses captured from a real user account.

The import contract is intentionally different from LeagueSaga's private persistence model. The
server owns the adapter between this public format and its internal domain objects.

## Publication checklist

Before making a branch, release, or repository public:

1. Run `npm run quality`.
2. Confirm fixtures use invented IDs, names, dates, and scores.
3. Run GitHub secret scanning or an equivalent history-aware secret scanner.
4. Review the complete Git history, not only the current working tree, for removed credentials or
   private payloads.
5. Confirm signing and notarization values exist only in GitHub Actions secrets.
6. Review dependency and bundled-license notices for the release artifact.
7. Confirm `docs/PRIVACY.md`, `docs/SECURITY.md`, and `docs/THIRD-PARTY-SERVICES.md` match current
   behavior.
8. Publish checksums with signed desktop releases.

## Legal and provider boundary

The MIT license covers code owned by the repository copyright holder. It does not grant rights to
provider trademarks, provider data, undocumented services, or third-party code under a different
license. Provider access and user-authorized data use remain subject to each provider's current
terms and policies. Obtain legal review before a broad public launch if provider terms or branding
questions are material to the release.
