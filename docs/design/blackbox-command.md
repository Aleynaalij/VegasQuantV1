# BLACKBOX / COMMAND — executive experience

## Identity

A quiet operational instrument rather than a casino dashboard. Deep forest and graphite form the work surface; champagne marks navigation, decisions and source references. Warm white is reserved for conclusions. No animated intelligence theater, fabricated uptime or decorative trend charts. The visual signature is a thin gold decision line, compact evidence chips, restrained concentric coverage mark and editorial-scale briefing.

## Four workspaces

- **Command:** one evidence-linked Director conclusion, explicitly unknown platform health, incident/engineering/decision counts clearly under the synthetic banner, contradiction card, evidence-linked activity.
- **Operations:** three role cards (registration is not presence), dependency-ordered packages, progressively disclosed plans and acceptance, read-only evidence.
- **Memory:** search across classifications and content; verified fixture resolutions, hypotheses and proposed improvements use distinct text and color. Provenance disclosures identify synthetic resolutions without asserting closure of actual incidents.
- **Control:** bounded decision packet, explicit pending independent review, approval lifecycle separate from execution, disabled production and emergency controls.

## System

| Token                    | Value / use                    |
| ------------------------ | ------------------------------ |
| Canvas                   | #0c1410                        |
| Surface                  | #142019                        |
| Text                     | #ecf1eb                        |
| Muted text               | #a2b2a9                        |
| Champagne                | #ddc38a, sources and decisions |
| Verified fixture         | #9ed7bc on #193d2b             |
| Caution                  | #ddc38a on #353020             |
| Blocked / failed         | #f2a99f on #3c2723             |
| Proposed / investigation | #b0c9ec on #253443             |

Self-hosted existing DM Sans and Manrope. Headings 29–42px, core body 12–14px, compact metadata 9–11px. Contrast and actual small-screen rendering must be tested, not inferred. 8/12/16/24/32px spacing rhythm; 6px controls, 10–12px panels. Status always has a written label. No live-presence dots on agents.

Desktop uses a persistent rail and two-column evidence hierarchy. Below 780px, four bottom destinations replace the rail, panels stack, package dependencies wrap and the evidence dialog becomes a full-height sheet. The work surface clears the fixed navigation and safe area. Navigation uses URL hashes and supports Back/Forward. Evidence uses a native modal dialog with Escape, close, backdrop dismissal, focus containment and return to trigger. Reduced motion disables transitions. Search handles empty results. Ready/loading/empty/unavailable/emergency-disabled scenarios are selectable, explicitly synthetic, nonpersistent.

## Security boundary

Additive preview-only route `/design/blackbox-command`, hard 404 outside development or Vercel preview. The route contains synthetic fixtures only; it is not an admin authorization implementation. Vercel deployment protection should remain enabled. Existing root layout gates remain intact. No live account, task, telemetry or billing data is read. No actions are executed. Existing operations routes, auth, RPCs, migrations, grants, agent execution, shared styles and PRs #282–#286 are not modified. This does not constitute independent security sign-off.

## Phase 4 integration proposal (not an implemented API)

Presentation should accept an immutable, role-scoped `CommandReadModel` from Codex's authorized read boundary. Suggested fields: `environment`, `synthetic`, `asOf`, `coverage`, `briefing`, `incidents`, `packages`, `decisions`, `memory`, `evidenceById`, and `capabilities`. Every substantive claim carries evidence IDs, revision, observed/source timestamps, scope and classification. Use distinct `proposed`, `authorized`, `executed`, `verified`, `revoked` events. Missing or stale source coverage must not become healthy. Visible-window counts must be labeled. Capabilities come from the server; UI hiding never enforces authorization.

Codex owns all backend contracts and Phase 4 execution. Claude reviews auth, mutation boundaries and independent review. Elo owns the presentation mapping. No API is requested to change without their written agreement. Future adapters must handle abort/stale response, role change, revoked session and missing evidence without keeping privileged content visible. Keep current review baseline fixed and integrate this as an additive presentation commit only after that review.

Any future approval control must show exact action, environment, immutable candidate, scope, expiry, independent reviewer and rollback reference; availability must be enforced server-side. Agent disable/re-enable and task recovery are **conceptual states only**, not capabilities asserted here. Recovery needs a new bounded proposal, source task/version, reason, allowed steps and independent review, never an automatic retry. Revoked permissions should invalidate stale decision packets. An emergency-disable indication must distinguish requested, acknowledged and verified state.

## Delivery and remaining dependencies

This is an isolated design branch based on PR #286 aab670c. Draft only; no production merge/deploy authorization. A protected hosted preview depends on the existing project's GitHub preview pipeline and protection. Real MFA end-to-end acceptance, live adapters, authorization actions, production health, and Phase 4 integration are out of scope and remain unverified. Synthetic screenshots are demonstrations, not operations evidence.
