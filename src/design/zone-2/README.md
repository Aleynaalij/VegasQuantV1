# Home + Zone 2.0 design lab

Isolated synthetic prototype: `/design/zone-2#home`. This is not production implementation. Route returns 404 unless NODE_ENV=development or VERCEL_ENV=preview. CSP blocks all network connections, forms and external assets. No live account, publishing, backend or shared component changes.

## Views
Home first-visit / returning-member switch, Tonight, NBA room, NHL room, Research, Community, permanent Dealer record and member/collection. Browser hash/back/forward connects views. Modal research includes an actual synthetic SVG download. Save/follow/reaction/poll controls affect browser memory only, reset on reload; they are not existing backend capabilities.

## Interaction contracts
Keyboard tabs use arrows/Home/End; native modal supplies focus trap/Escape/restore; route navigation focuses main; skip link; named inputs/buttons; visible focus ring; 44px or larger targets; reduced-motion CSS. No auto carousels or scrolling chart documents. Readable table/data alternatives for chart values. All fixtures and charts labeled synthetic. No odds/picks/performance claims supplied.

## Preserved destinations
Existing Home sports rooms, stories, Tonight, /research, Dealer-only discovery, /parlays My Lays, /slots builder, Fear, Simulator (Coming soon), account, notifications, saved legs, responsible-play/legal remain explicit. Nonimplemented tool destinations open explanatory dialogs, never production pages. Existing public routes are not replaced. Legacy game links remain untouched.

## Integration dependencies
- Reuse research-hub reader/filter/source freshness logic and original sport chart snapshots/renderers. Existing NHL has 9 chart pages; this prototype's rink heatmap is a future illustration, not a claim of source availability.
- Preserve `/community?post=&comment=&ruby=&sport=&view=` and member links; map existing game_zone_posts RPC into room research/discussion without swallowing errors as empty content.
- Separate available, stale, missing, blocked, failed and corrected research states. Frozen snapshots and historical publication provenance cannot be rewritten.
- Existing saved picks are LEGS. Research bookmarks and followed GAMES need a separately approved schema/API design; no backend invented here.
- Permanent Dealer update timeline requires append-only publication event aggregation. Existing leg_history is player-game history, not the new contract.
- Preserve posting, replies, likes/reactions, polls, votes, privacy, follow/block/report/moderation, 24-hour stories, share/download and existing entitlements. Most community actions here are explanatory demos, not full parity implementation.
- Simulator stays Coming soon until separately verified. MLB extensibility only; work scheduled February 2027.
- Implement consumer routes incrementally behind separately approved rollout gates, retain legacy route redirects and publisher contracts, compare fixture parity before any migration. Separate production approval required.

## Validation / reproducible capture
Run `node --import tsx --test tests/zone-2-design.test.ts`, `npm run typecheck`, `npm run build`.
On an authorized preview open `/design/zone-2#home`, capture 360x800, 390x844 and 1440x1000, repeat for #tonight #nba #nhl #research #community #pick #profile. Exercise first/returning switch, sport filter, search no-results, room arrow tabs, modal Escape/back, repeated saves and browser Back. Enable OS reduced motion. Use axe in an approved browser, verify chart alternatives and contrast. Physical touch and screen-reader checks are separate from desktop resizing.
Local Chromium is installed but could not launch in this executor; no screenshots or browser interaction passes claimed by this artifact. Parent may validate hosted preview independently.
