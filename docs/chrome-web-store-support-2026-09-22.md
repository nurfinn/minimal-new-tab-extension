# Chrome Web Store support — draft

**Status: not submitted. The support form did not offer a contact channel during the September 22 attempt.** The message below remains a local draft; no case number was created.

## Subject

Most reported installations remain on 1.5.4 after publication of 1.6 — update delivery or version analytics?

## Message

Hello Chrome Web Store Support,

I publish Minimal New Tab and would appreciate help understanding a persistent discrepancy between the published version and the dashboard's version distribution.

- Extension ID: `leofpnfpnigcbglbpknooldoaflbokcj`
- [Store listing](https://chromewebstore.google.com/detail/minimal-new-tab-by-nurfin/leofpnfpnigcbglbpknooldoaflbokcj)
- Current published version: **1.6**, published September 8, 2026.
- The Package page shows **1.6** in the Published column, with `storage` and `favicon` permissions. No rollout-percentage field is visible in that page's captured state.

The dashboard's daily users-by-version chart reports:

| Version | September 13 | September 20 |
| --- | ---: | ---: |
| 1.5.4 | 1,544 | 1,465 |
| 1.5.5 | 0 | 1 |
| 1.6 | 25 | 26 |

Versions 1.5.1 and 1.5.2 show zero on both dates. Version 1.6 represents approximately 1.74% of the September 20 total. These are aggregate counts, not a measurement of how many individual users updated. September 20 is the latest data date in the screenshots available to us.

We performed the following read-only checks on September 22:

1. Direct, unauthenticated update checks against `https://clients2.google.com/service/update2/crx`, using `response=updatecheck`, `prodversion=146.0.0.0`, `acceptformat=crx3`, and an encoded `x=id=<extension-id>&v=<extension-version>&uc` parameter:
   - Version 1.5.4: HTTP 200, update status `ok`, offered version 1.6.
   - Version 1.5.5: HTTP 200, update status `ok`, offered version 1.6.
   - Version 1.6: HTTP 200, update status `noupdate`.
   These synthetic requests do not reproduce a particular user's device or cohort.
2. The CRX supplied by that response contains version 1.6 and the correct release files. Its SHA-256 matches the update response: `6311dc9652126e5e4f927fa5ce49ff63aba28d86ad01717c864b4af6a60bddb0`.
3. The published package has the standard Web Store update URL. Comparing the 1.5.4 source manifest with the current release shows no newly requested permissions or added minimum Chrome version. The current extension does not install an `onUpdateAvailable` listener.
4. The publisher's inspected Chrome profile contains an unpacked development copy of 1.6 with a different extension ID, not the store installation. We therefore do not have an affected store-installed 1.5.4 client available to reproduce the issue, test a restart, or establish whether an update is pending. We have not treated the development copy as evidence that store auto-updates fail.

Could you please help determine:

- Whether any server-side distribution restriction or update-delivery issue is affecting this item or a subset of its installations?
- Whether the version distribution could be delayed, stale, or otherwise affected by an analytics issue?
- Which additional diagnostics would distinguish these possibilities?

We are not claiming a confirmed browser auto-update defect. The published package is available, but the aggregate version distribution has changed very little over the observed week. We would like to establish the cause before changing the extension or asking users to reinstall it.

Thank you.

## Attachments to include when submitting

- Daily users-by-version chart for September 13, 2026.
- Chart and tooltip for September 20, captured September 22, 2026.
- Package page showing the Published version 1.6, captured September 22, 2026.

These attachments have not been uploaded or sent. Do not attach private Chrome profile files or user browsing data. The official [Chrome Web Store developer support guidance](https://developer.chrome.com/docs/webstore/review-process#developer-communication) links to the support contact form and includes dashboard statistics issues among supported topics.

## Submission attempt — September 22, 2026

After the user asked us to complete the open support tab, we shortened the initial topic to fit the form's 100-character limit and followed its visible steps. Both the general “Other” route and the “Item status” route ended at Contact options with a message that support specialists would not be able to help based on those answers. The detailed message, attachment controls, and submission button were not offered. Nothing was submitted or attached.

The signed-in account shown in the support page matched the account in the already-open publisher dashboard for this item. Reopening the official One Stop Support URL with English selected redirected to the same general get-help flow. The support tab was left open at the first step with the concise topic filled in; the full message remains in this document.

Browser interaction used native macOS accessibility controls. JavaScript from Apple Events remained disabled; the temporary accessibility-tree setting was restored afterward. No extension settings, packages, or store publication settings were changed.

The user subsequently explicitly approved a separate public question about how to reach developer support. On September 22, it was submitted to Chromium Extensions without attachments, dashboard counts, extension ID, or this diagnostic report. Google Groups confirmed “Message sent, but awaiting approval.” See the [exact public message and submission record](chromium-support-access-2026-09-22.md). Public visibility is not yet confirmed. This does not create a private support case; the detailed message above remains unsent.
