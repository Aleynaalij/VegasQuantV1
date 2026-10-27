# JourneyBuilt, LLC · Vegas Quant policy review packet

Prepared October 14, 2026. Preliminary product/data review for counsel; not final legal approval, a compliance certification or an App Store clearance.

## Product facts
Owner identifies Vegas Quant as a JourneyBuilt, LLC product. Entity registration, principal address, jurisdiction, signing authority and public contact have not been verified here. Current product is a web/PWA service with research, community, personal tracking, and Stripe web memberships. It does not accept or place wagers or hold gambling deposits. Gambly and sportsbook handoffs still require classification review.

## Decisions for the owner and counsel
| Topic | Current implementation | Decision / evidence needed |
| --- | --- | --- |
| Operator and contact | JourneyBuilt attribution; no activated public support mailbox | Confirm entity details and monitored support/privacy/refund contact |
| Betting-related product | Research picks, odds, tickets and external handoffs | Review betting-aid rules, marketing, intended jurisdictions and age eligibility; disclaimers do not settle classification |
| Age | 21+ declaration at signup, client enforcement | Approve policy and server-side enforcement; do not describe self-declaration as verification |
| Memberships | Web Stripe monthly renewal and one-time season access | Approve refund policy and disclosures, native storefront-specific purchase flow; preserve mandatory consumer rights |
| Data | Email, profile, community, personal tracking, phone consent, push, feature events, billing IDs | Verify deployed providers, controller responsibilities, data transfers, processor contracts and final native SDK inventory |
| Retention | No approved schedule; immutable personal tracking and billing references | Decide per-category periods, lawful exceptions, backup lifecycle and proof of erasure |
| Deletion | Password-verified permanent deletion, atomic application/Auth cleanup, linked Stripe cancellation; legacy admin queue retained | Final disposable hosted Auth/Stripe and iPhone acceptance tests; export flow and approved provider retention disclosures |
| Community | Reports, blocks, limited phrase rules, MFA-admin restriction | Approve community rules and response ownership; test comments, member profiles, evasion and appeals |
| Liability and disputes | Plain limitations without sweeping waiver | Counsel choose enforceable governing law, venue, limitations and dispute process; no jurisdiction invented |
| Brand and content | Original VQ identity; team/source marks | Trademark clearance, brand ownership, league/team image and data licensing |
| Apple | No native package submitted | Native utility, deletion, moderation, privacy labels, age rating, payment, screenshots and review account |

## Release gate
Do not call policies “legally reviewed,” privacy labels verified, deletion complete, the inbox active or the app App Store-ready until the corresponding evidence exists. Update the public pages to match implemented behavior and approved policies. Existing immutable research and settled tickets remain separate from personal account cleanup.

## Source anchors
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion
- https://developer.apple.com/app-store/app-privacy-details/
- https://www.ncpgambling.org/help-treatment/about-the-national-problem-gambling-helpline/

## Independent age verification preparation

See age-verification.md: ID/selfie flow, service-only proof, current-policy age gates, guarded RPCs and checkout/notification restrictions are prepared. Mandatory enforcement remains off pending provider/fee approval, restricted credentials, webhook delivery, consent/retention review and live acceptance tests. Existing accounts have not been declared verified.
