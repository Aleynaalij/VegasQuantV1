# Game Intelligence Rooms integration

Track C builds an actual room view and stable, sport-qualified route on the reviewed #293 foundation. It is not a permanent historical research archive.

## Integration exports

- `gameRoomHref({ sport, id, start })` from `src/lib/game-room.ts` builds `/staging/discovery/rooms/[sport]/[id]?date=YYYY-MM-DD` using the Eastern schedule date.
- `GameIntelligenceRoom` default export accepts the existing authorized `HubData`, a validated `RoomReference`, loading/failure/refresh state, and optional Home and Zone destinations.
- `GameRoomClient` is the standalone staging container using the unchanged research reader and access-revalidation lifecycle. No new access system is introduced.
- The route retains the existing server-only non-production staging gate. The existing proxy descendant denial covers rollback; integration must include this route in hosted rollback tests.

## Implemented

Four-sport room identity; schedule/status/venue metadata; date-change disclosure without replacing the matchup; searchable research grouped by sport-aware topics; all returned findings with expandable full text; original record references and publication links; source directory with HTTPS validation; separate publication/collection/provider timestamps; original full-matchup, research, chart/download and discussion destinations. All protected findings remain hidden when the existing reader denies access.

## Explicit limitations

The existing reader uses the upcoming window and excludes completed/cancelled games. Deep links retain their exact sport and game ID but may render an unresolved historical state. There is no new historical database or archival guarantee. Missing source/topic/publication coverage is labeled, never replaced with synthetic data in connected mode. Game-linked discussion and a full correction/outcome ledger are not available from this reader. The sport-only Zone fallback is explicitly labeled; original publications retain their native comments, reactions, charts and downloads. No new grading or result inference occurs.

## Acceptance still required on integrated candidate

Protected real-account staging, physical-phone touch and screen reader checks, exact integrated build/hosted CI, full Home→Zone→room navigation, data reader compatibility with gate #295, repeated Back/Forward and authentication interruption, and route rollback evidence. Synthetic unit checks are not production permission parity.
