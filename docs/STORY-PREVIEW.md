# Admin story preview

Open `/?storyPreview=1` on a build containing this change, signed in as an existing MFA-verified, age-eligible administrator. Ordinary Home remains unchanged. **This source change is not a production deployment.**

The Home rail creates one browser-only sample for each row returned by the existing admin `community_roster` endpoint. That endpoint excludes banned accounts and caps the roster at 500; accounts without a chosen username retain its existing anonymous member label. The preview indicates when the cap is reached. No database or migration changes are needed. The ordinary app shell is unchanged, including its existing notification housekeeping; this feature does not publish stories or generate story notifications. Use synthetic local/CI tests or an isolated backend if absolutely no production writes are permitted during QA.

The banner and each story explicitly label the sample as test content not authored by the displayed member. The real story viewer handles previous/next, taps, keyboard controls, pause, autoplay and close. Preview rings remain available to replay. There are no discussion links, post writes, notifications, or saved read markers. Selecting Exit preview returns to normal Home; reloading regenerates samples.

The preview is available only via this explicit URL and a successful fresh `is_admin` check. Access is rechecked on focus, every viewer arrival and Home refresh. Auth changes close the open preview. Profile metadata is held only in memory and cleared while access is rechecked. Like the existing admin portal, this means authorized admins, not an additional sole-owner allowlist.

## Verification

- `node --import tsx --test tests/story-preview.test.ts`
- `npm test`
- `npm run typecheck`
- `npm run build`
- Synthetic local-browser suites: `story-preview.mjs`, `story-viewer.mjs`, `story-autoplay.mjs`, and `lobby-stories.mjs` in `scripts/ui-smoke`.

Do not seed real posts or assign content to real users for this test. No production data writes or deployment are part of this implementation.
