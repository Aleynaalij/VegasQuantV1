# App Store + Google Play checklist

Owner's running list (started Oct 31, 2026). Check items off as they're done; Claude updates this file when
something changes. Vegas Quant ships as **sports research and community**: no wagers are placed, held or paid in
the app. Keep every listing, screenshot and review note consistent with that.

## Accounts and business (owner)
- [ ] Apple Developer Program enrollment as an **organization** (JourneyBuilt, LLC), not an individual. Needs a
      D-U-N-S number for the LLC; request it early, it can take 1–2 weeks.
- [ ] Google Play Console account as an **organization** (JourneyBuilt, LLC), with the D-U-N-S number and
      identity verification.
- [ ] Support email and a public support URL (existing `/support` page).
- [ ] Privacy policy URL (`/privacy`) and terms URL (`/terms`) final and current.
- [ ] Decide app name, subtitle and bundle IDs (e.g. `app.vegasquant`), and reserve the name in both stores.

## Gambling-content rules (both stores)
- [ ] Listing copy says research and community, never "bet here"; no promises of profit or "locks".
- [ ] Age rating: Apple **17+** (frequent/intense simulated gambling + contests answers as applicable); Google
      content rating questionnaire answered honestly (gambling-themed content, no real-money gambling).
- [ ] Keep the in-app **21+** age gate and the responsible-play page linked from the app.
- [ ] Sportsbook/partner links (Gambly, Kalshi, FanDuel prices): confirm each store's rules for linking out to
      real-money operators; Apple may require geo-restriction or removal of direct sportsbook links in some
      regions. Decide before submission.
- [ ] VQ Slots: label clearly as free entertainment with no stakes, no purchase and no prizes, so it isn't
      reviewed as simulated casino gambling with paid currency.

## Payments
- [ ] Membership: digital subscriptions sold inside the iOS app must use **Apple In-App Purchase**; on Android,
      **Google Play Billing**. Decide: in-app subscriptions, or a reader-style app where members sign in to an
      existing web subscription (no purchase links inside the app).
- [ ] If using IAP: create subscription products, prices and free-trial terms in both consoles; restore-purchases
      button; server-side receipt validation tied to existing membership status.

## Building the app (Claude)
- [ ] Wrap the existing web app (Capacitor or similar) with real native value: push notifications, home-screen
      icon/splash, share sheet, offline/error screens. Apple rejects plain website wrappers (guideline 4.2).
- [ ] Native push: APNs key (Apple) + Firebase Cloud Messaging (Google), wired to existing notification prefs.
- [ ] Sign in with Apple, if any other social sign-in is offered on iOS.
- [ ] In-app **account deletion** (already exists on the web; confirm it's reachable in the app).
- [ ] Deep links (universal links / Android app links) for posts, games and picks.
- [ ] App icons, splash screens, and adaptive icon for Android.

## Privacy forms
- [ ] Apple **App Privacy** "nutrition label": data collected (account email, profile, photos, usage), linked to
      identity, no tracking unless we add ad SDKs.
- [ ] Google **Data safety** form with the same answers.
- [ ] Apple privacy manifest for any SDKs used in the wrapper.

## Store listings
- [ ] Screenshots: iPhone 6.7" and 6.5", iPad if supported; Android phone (and tablet if supported).
- [ ] Short and full descriptions, keywords (Apple), feature graphic 1024×500 (Google).
- [ ] Optional preview video.

## Review and launch
- [ ] Demo **review account** (member access, age-verified) with credentials in the review notes.
- [ ] Review notes explaining: research and community only, no real-money wagering, 21+ gate, where picks come
      from, how Slots works.
- [ ] TestFlight (Apple) and internal/closed testing track (Google; new personal accounts need a 12-tester,
      14-day closed test before production. Organization accounts are exempt, another reason to enroll the LLC).
- [ ] Submit, answer reviewer questions, release.
