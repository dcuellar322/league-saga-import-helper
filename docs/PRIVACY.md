# Import Helper Privacy Statement

Effective August 31, 2026

Cuellar Labs LLC, a Texas limited liability company doing business as LeagueSaga, distributes the
LeagueSaga Import Helper. This statement explains what the helper processes on your computer and
what it can send to LeagueSaga.

The LeagueSaga [Privacy Policy](https://www.leaguesaga.com/privacy-policy/) applies after you
upload league information to the LeagueSaga service.

## What you sign in to

You sign in directly with ESPN inside the helper. You enter your ESPN password on ESPN's website.
The helper and LeagueSaga do not receive your ESPN password.

Use only an ESPN account and league that you are authorized to access. The helper does not grant
permission from ESPN, Disney, the NFL, or another rights holder. Their terms and privacy policies
continue to apply.

## What stays on your computer

Your ESPN session cookies stay on your computer inside the helper's isolated ESPN session. The
helper does not read Chrome, Safari, Firefox, or another browser cookie store. LeagueSaga does not
receive raw ESPN cookies from the helper.

The ESPN session is separate from your normal browser profile. Packaged builds enable Electron's
operating-system-backed cookie encryption. Closing the helper ends its non-persistent ESPN session.
You can also select **Clear ESPN Session** to remove its ESPN cookies and local session storage.

Short-lived LeagueSaga import tokens authorize an upload. The helper does not save these tokens in
its settings file. Packaged builds send reviewed history packages only to
`https://portal.leaguesaga.com`.

## What you can send to LeagueSaga

Only the fantasy-football history package that you review is sent to LeagueSaga. Each season is
validated separately, and the package can include the league name, season, team names, owner display identifiers and names from ESPN,
rosters, matchups, draft picks, and transaction history.

League and team records are required. Before upload, you can exclude rosters, matchups, draft
picks, or transactions. You can inspect the reviewed JSON and save it locally. After upload,
LeagueSaga stores and uses the information under the LeagueSaga Privacy Policy and account
controls. The helper does not keep a separate copy unless you choose **Save JSON locally**.

League information can identify or relate to other league members. Tell affected members that you
will import their information. Do not import a league if you do not have permission.

## Local settings, diagnostics, and updates

The helper stores local settings that are needed for the application. It keeps a rotating local
diagnostic log with event names, result codes, and totals. The log does not contain cookies, import
tokens, raw headers, passwords, secrets, or raw ESPN responses. The helper does not upload the log.
You choose whether to save and share it with support.

The packaged helper can contact GitHub's public releases service to check for a newer official
version. It sends the ordinary technical information needed for that HTTPS request, such as the IP
address that GitHub receives. It does not send ESPN cookies, a LeagueSaga import token, or imported
league information during an update check.

## Independent service

LeagueSaga and the Import Helper are independent. They are not affiliated with, endorsed by,
sponsored by, or approved by ESPN, Disney, the NFL, or GitHub. See
[Third-Party Services](THIRD-PARTY-SERVICES.md) for the boundaries that apply.

## Questions and security reports

Send privacy questions to [support@leaguesaga.com](mailto:support@leaguesaga.com). Do not
include passwords, tokens, cookies, session values, or raw league records. Use the private reporting
route in [SECURITY.md](SECURITY.md) for a suspected vulnerability.
