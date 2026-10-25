import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  analystCard,
  analystCopy,
  analystOpen,
  type AnalystDoubleUp,
} from "../src/lib/analyst-double-up.ts";
const ticket = {
  title: "Double Up",
  sportsbook: "FanDuel",
  combined_odds: 238,
  created_at: "2026-10-25T12:00:00Z",
  expires_at: "2026-10-25T13:30:00Z",
  candidates: [
    {
      name: "Sample",
      market: "Full game · 40+ receiving yards",
      copy_text: "Sample 40+ receiving yards",
    },
  ],
} as AnalystDoubleUp;
test("analyst card distinguishes opinion and observed whole-slip price without a model claim", () => {
  assert.equal(analystCard(ticket).eyebrow, "VEGAS QUANT · ANALYST PICK");
  assert.equal(analystCard(ticket).price, "FanDuel +238");
  assert.match(analystCard(ticket).footnote!, /No validated model edge/);
  assert.equal(analystCopy(ticket), "Sample 40+ receiving yards");
  assert.equal(analystOpen(ticket, Date.parse(ticket.expires_at) - 1), true);
  assert.equal(analystOpen(ticket, Date.parse(ticket.expires_at)), false);
  assert.equal(analystOpen({ ...ticket, expires_at: "invalid" }), false);
});
test("analyst publishing retains non-model gates, exact complete quote, RLS and one daily slot", () => {
  const result = execFileSync(
    process.execPath,
    ["tests/sql/analyst-double-up.mjs"],
    { encoding: "utf8", timeout: 60000 },
  );
  assert.match(result, /unchanged model gate passed/);
});
